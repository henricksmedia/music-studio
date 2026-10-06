/** Mix graph shared by live playback and offline render. Nudges that don't need re-composition land here. */
import { STEM_IDS, type NoteEvent, type Song, type StemId } from "./compose";
import { makeVoiceCtx, playEvent, type VoiceCtx } from "./instruments";
import type { Dimensions } from "../types";

export type MixParams = Pick<Dimensions, "space" | "bass" | "grit" | "vocalCharacter" | "genrePull" | "drumFeel">;

type StemBus = {
  input: GainNode;
  tone: BiquadFilterNode;
  dry: GainNode;
  gritOut: GainNode;
  level: GainNode;
  rev: GainNode;
  dly: GainNode;
};

export type Graph = {
  ctx: BaseAudioContext;
  voice: VoiceCtx;
  stems: Record<StemId, StemBus>;
  out: GainNode;
  analyser: AnalyserNode | null;
  delay: DelayNode;
  lowShelf: BiquadFilterNode;
  highShelf: BiquadFilterNode;
  setMix: (m: MixParams, smooth?: boolean) => void;
  setTempo: (bpm: number) => void;
};

const BASE_LEVEL: Record<StemId, number> = { drums: 0.85, bass: 0.6, harmony: 0.78, lead: 0.66, texture: 0.6 };
const REV_AMT: Record<StemId, number> = { drums: 0.12, bass: 0, harmony: 0.45, lead: 0.4, texture: 0.55 };
const DLY_AMT: Record<StemId, number> = { drums: 0, bass: 0, harmony: 0.08, lead: 0.32, texture: 0.1 };
const GRIT_AMT: Record<StemId, number> = { drums: 0.25, bass: 0.35, harmony: 0.6, lead: 0.55, texture: 0.2 };

function impulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  let seed = 99;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296) * 2 - 1;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      lp = lp * 0.55 + rnd() * 0.45; // darker tail
      const pre = t < 0.012 ? 0 : 1;
      d[i] = lp * Math.pow(1 - i / len, 2.2) * Math.exp(-t * 1.4) * pre;
    }
  }
  return buf;
}

export function buildGraph(ctx: BaseAudioContext, withAnalyser = false): Graph {
  const voice = makeVoiceCtx(ctx);
  const masterIn = ctx.createGain();
  const lowShelf = ctx.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 110;
  const highShelf = ctx.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = 7000;
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -16;
  glue.ratio.value = 2.5;
  glue.knee.value = 8;
  glue.attack.value = 0.015;
  glue.release.value = 0.25;
  const makeup = ctx.createGain();
  makeup.gain.value = 1.15;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.1;
  const out = ctx.createGain();
  out.gain.value = 0.9;
  // Final safety: soft clipper guarantees output stays inside [-0.98, 0.98] even if the limiter overshoots.
  const clip = ctx.createWaveShaper();
  const cc = new Float32Array(new ArrayBuffer(4097 * 4));
  for (let i = 0; i < 4097; i++) {
    const x = (i / 4096) * 4 - 2; // input range -2..2 (odd length keeps 0 → 0)
    const a = Math.abs(x);
    const y = a <= 0.8 ? a : 0.8 + 0.18 * Math.tanh((a - 0.8) / 0.18);
    cc[i] = Math.sign(x) * y;
  }
  clip.curve = cc;
  clip.oversample = "none"; // oversampling filters can ring past the ceiling
  const pre = ctx.createGain();
  pre.gain.value = 0.5; // map -2..2 input range onto curve's -1..1 domain
  masterIn.connect(lowShelf).connect(highShelf).connect(glue).connect(makeup).connect(limiter).connect(out).connect(pre).connect(clip);
  let analyser: AnalyserNode | null = null;
  if (withAnalyser) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    clip.connect(analyser);
    analyser.connect(ctx.destination);
  } else clip.connect(ctx.destination);

  // shared reverb + delay
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 3.2);
  const revIn = ctx.createGain();
  const revHp = ctx.createBiquadFilter();
  revHp.type = "highpass";
  revHp.frequency.value = 200;
  const revOut = ctx.createGain();
  revOut.gain.value = 0.9;
  revIn.connect(revHp).connect(reverb).connect(revOut).connect(masterIn);

  const delay = ctx.createDelay(2);
  delay.delayTime.value = 0.35;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const dlyLp = ctx.createBiquadFilter();
  dlyLp.type = "lowpass";
  dlyLp.frequency.value = 3200;
  const dlyIn = ctx.createGain();
  const dlyOut = ctx.createGain();
  dlyOut.gain.value = 0.6;
  dlyIn.connect(delay);
  delay.connect(dlyLp).connect(fb).connect(delay);
  dlyLp.connect(dlyOut).connect(masterIn);
  dlyOut.connect(revIn);

  const stems = {} as Record<StemId, StemBus>;
  for (const id of STEM_IDS) {
    const input = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 18000;
    tone.Q.value = 0.5;
    const dry = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    shaper.curve = voice.shaperCurve;
    shaper.oversample = "2x";
    const gritPre = ctx.createGain();
    gritPre.gain.value = 2;
    const gritOut = ctx.createGain();
    gritOut.gain.value = 0;
    const level = ctx.createGain();
    level.gain.value = BASE_LEVEL[id];
    input.connect(tone);
    tone.connect(dry).connect(level);
    tone.connect(gritPre).connect(shaper).connect(gritOut).connect(level);
    level.connect(masterIn);
    const rev = ctx.createGain();
    const dly = ctx.createGain();
    level.connect(rev).connect(revIn);
    level.connect(dly).connect(dlyIn);
    stems[id] = { input, tone, dry, gritOut, level, rev, dly };
  }

  const setParam = (p: AudioParam, v: number, smooth: boolean) => {
    if (smooth && "currentTime" in ctx && !(typeof OfflineAudioContext !== "undefined" && ctx instanceof OfflineAudioContext)) {
      const now = ctx.currentTime;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(v, now + 0.08);
    } else p.value = v;
  };

  const g: Graph = {
    ctx,
    voice,
    stems,
    out,
    analyser,
    delay,
    lowShelf,
    highShelf,
    setTempo(bpm) {
      delay.delayTime.value = Math.min(1.5, (60 / bpm) * 0.75); // dotted eighth
    },
    setMix(m, smooth = false) {
      const space = m.space / 100;
      const grit = m.grit / 100;
      const bass = m.bass / 100;
      const vc = m.vocalCharacter / 100;
      for (const id of STEM_IDS) {
        const s = stems[id];
        let lvl = BASE_LEVEL[id];
        if (id === "bass") lvl *= 0.55 + bass * 0.9;
        if (id === "drums") lvl *= 0.82 + (m.drumFeel / 100) * 0.3;
        if (id === "lead") lvl *= 0.8 + vc * 0.35;
        setParam(s.level.gain, lvl, smooth);
        setParam(s.rev.gain, REV_AMT[id] * Math.pow(space, 1.3) * 1.6, smooth);
        setParam(s.dly.gain, DLY_AMT[id] * space * 1.4, smooth);
        const ga = GRIT_AMT[id] * grit;
        setParam(s.gritOut.gain, ga * 0.55, smooth);
        setParam(s.dry.gain, 1 - ga * 0.45, smooth);
        if (id === "lead") setParam(s.tone.frequency, 1600 + Math.pow(vc, 1.5) * 12000, smooth);
        if (id === "harmony") setParam(s.tone.frequency, 3500 + (m.genrePull / 100) * 12000, smooth);
      }
      setParam(fb.gain, 0.18 + space * 0.3, smooth);
      setParam(lowShelf.gain, (bass - 0.5) * 9, smooth);
      setParam(highShelf.gain, -2 + (m.genrePull / 100) * 3 - grit * 1.5, smooth);
    },
  };
  return g;
}

export function scheduleEvent(g: Graph, ev: NoteEvent, when: number, beatSec: number, dest?: AudioNode) {
  playEvent(g.voice, ev, when, beatSec, dest ?? g.stems[ev.stem].input);
}

export type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

/** Render a song (or a subset of stems) to an AudioBuffer. */
export async function renderSong(
  song: Song,
  mix: MixParams,
  opts: { stems?: StemId[]; sampleRate?: number; seconds?: number; startBeat?: number; Ctor?: OfflineCtor } = {}
): Promise<AudioBuffer> {
  const sr = opts.sampleRate ?? 44100;
  const beatSec = 60 / song.bpm;
  const startBeat = opts.startBeat ?? 0;
  const seconds = opts.seconds ?? song.durationSec - startBeat * beatSec + 3;
  const Ctor = opts.Ctor ?? (globalThis as unknown as { OfflineAudioContext: OfflineCtor }).OfflineAudioContext;
  const ctx = new Ctor(2, Math.ceil(sr * seconds), sr);
  const g = buildGraph(ctx);
  g.setTempo(song.bpm);
  g.setMix(mix);
  const want = opts.stems ? new Set(opts.stems) : null;
  const start = 0.05;
  for (const ev of song.events) {
    if (want && !want.has(ev.stem)) continue;
    if (ev.t < startBeat) continue;
    const when = start + (ev.t - startBeat) * beatSec;
    if (when > seconds) break;
    scheduleEvent(g, ev, when, beatSec);
  }
  return ctx.startRendering();
}

export function peakOf(buf: AudioBuffer): number {
  let p = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > p) p = a;
    }
  }
  return p;
}

export function scaleBuffer(buf: AudioBuffer, gain: number) {
  if (gain === 1) return;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = Math.max(-1, Math.min(1, d[i] * gain));
  }
}
