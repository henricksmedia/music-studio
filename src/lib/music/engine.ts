/** Realtime playback: lookahead scheduler over a composed Song, sharing the render graph with export. */
import { buildGraph, scheduleEvent, renderSong, autoAt, type Graph, type MixParams } from "./render";
import { STEM_IDS, type Song, type StemId } from "./compose";
import { encodeWav, makeZip } from "./files";
import { isAudible, trackMix, type TrackMix, type Tracks } from "./tracks";

const LOOKAHEAD = 0.3;
const TICK_MS = 50;

export type Position = { beat: number; bar: number; sectionIndex: number; chord: string; progress: number };

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private graph: Graph | null = null;
  private song: Song | null = null;
  private mix: MixParams | null = null;
  private tracks: TrackMix | null = null;
  private playing = false;
  private startTime = 0;
  private cursor = { loop: 0, i: 0 };
  private autoCursor = { loop: 0, i: 0 };
  private scheduledUntil = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private session: Record<StemId, GainNode> | null = null;
  private pausedAt = 0;

  /** Call synchronously inside a tap handler so iOS/Android unlock audio. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC({ latencyHint: "playback" });
      this.graph = buildGraph(this.ctx, true);
      if (this.mix) this.graph.setMix(this.mix);
      if (this.tracks) this.graph.setTracks(this.tracks);
    }
    if (this.ctx.state !== "running") void this.ctx.resume();
  }

  getAnalyser() {
    return this.graph?.analyser ?? null;
  }

  getTaps() {
    return this.graph?.taps ?? null;
  }

  isPlaying() {
    return this.playing;
  }

  setMix(m: MixParams) {
    this.mix = m;
    this.graph?.setMix(m, this.playing);
  }

  setTracks(t: Tracks) {
    this.tracks = trackMix(t);
    this.graph?.setTracks(this.tracks, this.playing);
  }

  private newSession() {
    if (!this.ctx || !this.graph) return;
    const s = {} as Record<StemId, GainNode>;
    for (const id of STEM_IDS) {
      const g = this.ctx.createGain();
      g.connect(this.graph.stems[id].input);
      s[id] = g;
    }
    this.session = s;
  }

  private endSession() {
    if (!this.ctx || !this.session) return;
    const now = this.ctx.currentTime;
    const old = this.session;
    for (const id of STEM_IDS) {
      old[id].gain.cancelScheduledValues(now);
      old[id].gain.setValueAtTime(old[id].gain.value, now);
      old[id].gain.linearRampToValueAtTime(0, now + 0.06);
    }
    setTimeout(() => STEM_IDS.forEach((id) => old[id].disconnect()), 400);
    this.session = null;
  }

  private indexAt(beat: number) {
    const ev = this.song!.events;
    let lo = 0;
    let hi = ev.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ev[mid].t < beat) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private autoIndexAt(beat: number) {
    const pts = this.song!.automation;
    let i = 0;
    while (i < pts.length && pts[i].beat <= beat) i++;
    return i;
  }

  /** Reset per-section production automation (filter / width / saturation / delay) to a beat. */
  private resetAutomation(beat: number) {
    if (!this.ctx || !this.graph || !this.song) return;
    const now = this.ctx.currentTime;
    this.graph.cancelAuto(now);
    this.graph.setAuto(autoAt(this.song, beat), now);
    this.autoCursor = { loop: 0, i: this.autoIndexAt(beat) };
  }

  /** Start (or resume) playback at a beat position. */
  play(fromBeat?: number) {
    if (!this.ctx || !this.graph || !this.song) return;
    this.endSession();
    this.newSession();
    const beat = fromBeat ?? this.pausedAt;
    const beatSec = 60 / this.song.bpm;
    this.graph.applyFx(this.song.spec.production.fx, this.song.spec.production.mix, this.song.bpm);
    this.graph.setTempo(this.song.bpm);
    if (this.mix) this.graph.setMix(this.mix);
    this.startTime = this.ctx.currentTime + 0.08 - beat * beatSec;
    this.cursor = { loop: 0, i: this.indexAt(beat) };
    this.resetAutomation(beat);
    if (this.cursor.i >= this.song.events.length) this.cursor = { loop: 1, i: 0 };
    this.scheduledUntil = this.ctx.currentTime;
    this.playing = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(this.tick, TICK_MS);
    this.tick();
  }

  pause() {
    if (!this.playing) return;
    this.pausedAt = this.position()?.beat ?? 0;
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.endSession();
  }

  /** Swap in a new song. "restart" jumps to bar 1; "continue" keeps the musical position (for nudges/edits). */
  setSong(song: Song, mode: "restart" | "continue" = "continue") {
    const old = this.song;
    this.song = song;
    if (mode === "restart") this.pausedAt = 0;
    if (!this.playing || !this.ctx || !this.graph) {
      if (old && mode === "continue") this.pausedAt = Math.min(this.pausedAt * (song.totalBeats / old.totalBeats), song.totalBeats - 1);
      return;
    }
    if (mode === "restart" || !old) {
      this.play(0);
      return;
    }
    const oldBeatSec = 60 / old.bpm;
    const raw = (this.scheduledUntil - this.startTime) / oldBeatSec;
    const pos = ((raw % old.totalBeats) + old.totalBeats) % old.totalBeats;
    const newPos = old.totalBeats === song.totalBeats ? pos : (pos / old.totalBeats) * song.totalBeats;
    const beatSec = 60 / song.bpm;
    this.graph.applyFx(song.spec.production.fx, song.spec.production.mix, song.bpm);
    this.graph.setTempo(song.bpm);
    this.startTime = this.scheduledUntil - newPos * beatSec;
    this.cursor = { loop: 0, i: this.indexAt(newPos) };
    this.resetAutomation(newPos);
    if (this.cursor.i >= song.events.length) this.cursor = { loop: 1, i: 0 };
  }

  private tick = () => {
    const ctx = this.ctx;
    const song = this.song;
    if (!this.playing || !ctx || !song || !this.graph || !this.session) return;
    const horizon = ctx.currentTime + LOOKAHEAD;
    const beatSec = 60 / song.bpm;
    const ev = song.events;
    if (!ev.length) return;
    let guard = 0;
    while (guard++ < 4000) {
      const e = ev[this.cursor.i];
      const when = this.startTime + (this.cursor.loop * song.totalBeats + e.t) * beatSec;
      if (when >= horizon) break;
      if (when >= ctx.currentTime - 0.02) scheduleEvent(this.graph, e, Math.max(when, ctx.currentTime + 0.005), beatSec, this.session[e.stem]);
      this.cursor.i++;
      if (this.cursor.i >= ev.length) {
        this.cursor.i = 0;
        this.cursor.loop++;
      }
    }
    // production automation (same clock, same loop wrap)
    const pts = song.automation;
    guard = 0;
    while (pts.length && guard++ < 200) {
      const p = pts[this.autoCursor.i];
      const when = this.startTime + (this.autoCursor.loop * song.totalBeats + p.beat) * beatSec;
      if (when >= horizon) break;
      if (when >= ctx.currentTime) this.graph.rampAuto(p, when);
      this.autoCursor.i++;
      if (this.autoCursor.i >= pts.length) {
        this.autoCursor.i = 0;
        this.autoCursor.loop++;
        const loopStart = this.startTime + this.autoCursor.loop * song.totalBeats * beatSec;
        if (loopStart >= ctx.currentTime) this.graph.setAuto(autoAt(song, 0), loopStart);
      }
    }
    this.scheduledUntil = horizon;
  };

  position(): Position | null {
    const song = this.song;
    if (!song) return null;
    let beat = this.pausedAt;
    if (this.playing && this.ctx) {
      const raw = (this.ctx.currentTime - this.startTime) / (60 / song.bpm);
      beat = ((raw % song.totalBeats) + song.totalBeats) % song.totalBeats;
    }
    // bars can have different lengths (odd meters, mixed bars, ritard), so search the bar grid
    const bs = song.barStarts;
    let lo = 0;
    let hi = Math.max(0, bs.length - 2);
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (bs[mid] <= beat) lo = mid;
      else hi = mid - 1;
    }
    const bar = lo;
    let sectionIndex = 0;
    for (let i = 0; i < song.sections.length; i++) if (beat >= song.sections[i].startBeat) sectionIndex = i;
    return { beat, bar, sectionIndex, chord: song.barChords[bar] ?? "", progress: beat / song.totalBeats };
  }

  /** Offline render → WAV (mix) or ZIP (mix + stems). Uses the exact same synth graph as playback. */
  /** The mix is what you hear (track volume, pan, mute/solo). Stems are the audible tracks, named after them. */
  async exportAudio(song: Song, mix: MixParams, tracks: Tracks, withStems: boolean, onProgress?: (msg: string) => void): Promise<{ blob: Blob; ext: "wav" | "zip" }> {
    const audible = STEM_IDS.filter((id) => isAudible(tracks, id) && song.events.some((e) => e.stem === id));
    if (!audible.length) throw new Error("every track is muted");
    const tm = trackMix(tracks);
    const stems = withStems ? audible : [];
    const passes = 1 + stems.length;
    const report = (pass: number, label: string) => (f: number) => onProgress?.(`${label}… ${Math.round(((pass + f) / passes) * 100)}%`);
    const mixWav = encodeWav(await renderSong(song, mix, { stems: audible, tracks: tm, onProgress: report(0, "Rendering mix") }));
    if (!withStems) return { blob: new Blob([mixWav], { type: "audio/wav" }), ext: "wav" };
    const files = [{ name: "mix.wav", data: mixWav }];
    const used = new Set<string>(["mix"]);
    for (let i = 0; i < stems.length; i++) {
      const id = stems[i];
      let base = tracks[id].name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || id;
      if (used.has(base)) base = `${base}-${id}`;
      used.add(base);
      const buf = await renderSong(song, mix, { stems: [id], tracks: tm, onProgress: report(i + 1, `Rendering stem ${i + 1}/${stems.length} (${tracks[id].name})`) });
      files.push({ name: `${base}.wav`, data: encodeWav(buf) });
    }
    onProgress?.("Packing zip…");
    return { blob: new Blob(makeZip(files), { type: "application/zip" }), ext: "zip" };
  }
}

export const engine = new MusicEngine();
