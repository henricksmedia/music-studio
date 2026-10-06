/** Realtime playback: lookahead scheduler over a composed Song, sharing the render graph with export. */
import { buildGraph, scheduleEvent, renderSong, type Graph, type MixParams } from "./render";
import { STEM_IDS, type Song, type StemId } from "./compose";
import { encodeWav, makeZip } from "./files";

const LOOKAHEAD = 0.3;
const TICK_MS = 50;

export type Position = { beat: number; bar: number; sectionIndex: number; chord: string; progress: number };

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private graph: Graph | null = null;
  private song: Song | null = null;
  private mix: MixParams | null = null;
  private playing = false;
  private startTime = 0;
  private cursor = { loop: 0, i: 0 };
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
    }
    if (this.ctx.state !== "running") void this.ctx.resume();
  }

  getAnalyser() {
    return this.graph?.analyser ?? null;
  }

  isPlaying() {
    return this.playing;
  }

  setMix(m: MixParams) {
    this.mix = m;
    this.graph?.setMix(m, this.playing);
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

  /** Start (or resume) playback at a beat position. */
  play(fromBeat?: number) {
    if (!this.ctx || !this.graph || !this.song) return;
    this.endSession();
    this.newSession();
    const beat = fromBeat ?? this.pausedAt;
    const beatSec = 60 / this.song.bpm;
    this.graph.setTempo(this.song.bpm);
    if (this.mix) this.graph.setMix(this.mix);
    this.startTime = this.ctx.currentTime + 0.08 - beat * beatSec;
    this.cursor = { loop: 0, i: this.indexAt(beat) };
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
    this.graph.setTempo(song.bpm);
    this.startTime = this.scheduledUntil - newPos * beatSec;
    this.cursor = { loop: 0, i: this.indexAt(newPos) };
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
    const bar = Math.floor(beat / 4);
    const sectionIndex = Math.max(0, song.sections.findIndex((s) => bar >= s.startBar && bar < s.startBar + s.bars));
    return { beat, bar, sectionIndex, chord: song.barChords[bar] ?? "", progress: beat / song.totalBeats };
  }

  /** Offline render → WAV (mix) or ZIP (mix + stems). Uses the exact same synth graph as playback. */
  async exportAudio(song: Song, mix: MixParams, withStems: boolean, onProgress?: (msg: string) => void): Promise<{ blob: Blob; ext: "wav" | "zip" }> {
    onProgress?.("Rendering mix…");
    const mixBuf = await renderSong(song, mix);
    const mixWav = encodeWav(mixBuf);
    if (!withStems) return { blob: new Blob([mixWav.buffer as ArrayBuffer], { type: "audio/wav" }), ext: "wav" };
    const files = [{ name: "mix.wav", data: mixWav }];
    const stems = STEM_IDS.filter((id) => song.events.some((e) => e.stem === id));
    for (let i = 0; i < stems.length; i++) {
      onProgress?.(`Rendering stem ${i + 1}/${stems.length}: ${stems[i]}…`);
      const buf = await renderSong(song, mix, { stems: [stems[i]] });
      files.push({ name: `${stems[i]}.wav`, data: encodeWav(buf) });
    }
    onProgress?.("Packing zip…");
    const zip = makeZip(files);
    return { blob: new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" }), ext: "zip" };
  }
}

export const engine = new MusicEngine();
