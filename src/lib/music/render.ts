/** Mix graph shared by live playback and offline render. Nudges that don't need re-composition land here.
 *  Per-section production moves (filter automation, stereo width, saturation, delay throws) are AudioParam
 *  automation on dedicated nodes, driven by Song.automation. */
import { STEM_IDS, type AutoPoint, type NoteEvent, type Song, type StemId } from "./compose";
import { makeVoiceCtx, playEvent, type VoiceCtx } from "./instruments";
import type { Fx, MixGeometry, ReverbId, DelayId } from "./spec";
import type { Dimensions } from "../types";

export type MixParams = Pick<Dimensions, "space" | "bass" | "grit" | "vocalCharacter" | "genrePull" | "drumFeel">;
export type AutoValues = Omit<AutoPoint, "beat">;

type StemBus = {
  input: GainNode;
  tone: BiquadFilterNode;
  auto: BiquadFilterNode;
  pump: GainNode;
  dry: GainNode;
  gritOut: GainNode;
  level: GainNode;
  side: GainNode;
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
  applyFx: (fx: Fx, mix: MixGeometry, bpm: number) => void;
  setAuto: (a: AutoValues, when: number) => void;
  rampAuto: (a: AutoValues, when: number) => void;
  cancelAuto: (when: number) => void;
  pumpOn: boolean;
};

const BASE_LEVEL: Record<StemId, number> = { drums: 0.85, bass: 0.6, harmony: 0.78, lead: 0.66, texture: 0.6 };
const REV_AMT: Record<StemId, number> = { drums: 0.12, bass: 0, harmony: 0.45, lead: 0.4, texture: 0.55 };
const DLY_AMT: Record<StemId, number> = { drums: 0, bass: 0, harmony: 0.08, lead: 0.32, texture: 0.1 };
const GRIT_AMT: Record<StemId, number> = { drums: 0.25, bass: 0.35, harmony: 0.6, lead: 0.55, texture: 0.2 };
/** How much Haas-side signal each stem gets at width = 1. Bass stays mono (mono sub). */
const WIDTH_AMT: Record<StemId, number> = { drums: 0.12, bass: 0, harmony: 0.55, lead: 0.3, texture: 0.5 };
const AUTO_FILTERED: StemId[] = ["harmony", "lead", "texture"];
export const filterHz = (x: number) => 180 * Math.pow(110, Math.max(0, Math.min(1, x)));

type IrShape = { seconds: number; dark: number; pre: number; decay: number; spring?: boolean; bright?: boolean };
const IR: Record<ReverbId, IrShape> = {
  room: { seconds: 1.0, dark: 0.4, pre: 0.006, decay: 4.5 },
  plate: { seconds: 2.2, dark: 0.25, pre: 0.01, decay: 2.0, bright: true },
  hall: { seconds: 3.4, dark: 0.55, pre: 0.025, decay: 1.3 },
  spring: { seconds: 1.8, dark: 0.35, pre: 0.004, decay: 2.4, spring: true },
  shimmer: { seconds: 5.0, dark: 0.15, pre: 0.03, decay: 0.75, bright: true },
};

function impulse(ctx: BaseAudioContext, shape: IrShape): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * shape.seconds);
  const buf = ctx.createBuffer(2, len, sr);
  let seed = 99;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296) * 2 - 1;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      lp = lp * shape.dark + rnd() * (1 - shape.dark);
      let x = lp * Math.pow(1 - i / len, 2.2) * Math.exp(-t * shape.decay) * (t < shape.pre ? 0 : 1);
      if (shape.spring) x *= 0.6 + 0.4 * Math.sin(2 * Math.PI * (38 + 6 * ch) * t) * Math.exp(-t * 2); // boingy flutter
      if (shape.bright && i % 2 === 0) x *= 1.15;
      d[i] = x;
    }
  }
  return buf;
}

function stepCurve(levels: number): Float32Array<ArrayBuffer> {
  const n = 2049;
  const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.round(x * levels) / levels;
  }
  return c;
}

function satCurve(k: number): Float32Array<ArrayBuffer> {
  const n = 2049;
  const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}

const DELAY_BEATS: Record<DelayId, number> = { dotted8: 0.75, quarter: 1, triplet8: 2 / 3, slap: 0 };

export function buildGraph(ctx: BaseAudioContext, withAnalyser = false): Graph {
  const voice = makeVoiceCtx(ctx);
  const masterIn = ctx.createGain();
  const lowShelf = ctx.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 110;
  const highShelf = ctx.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = 7000;
  const tapeLp = ctx.createBiquadFilter();
  tapeLp.type = "lowpass";
  tapeLp.frequency.value = 20000;
  tapeLp.Q.value = 0.4;
  // parallel bus saturation (amount automated per section)
  const satDry = ctx.createGain();
  const satPre = ctx.createGain();
  satPre.gain.value = 1.4;
  const satShaper = ctx.createWaveShaper();
  satShaper.curve = satCurve(3);
  const satOut = ctx.createGain();
  satOut.gain.value = 0;
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
  // Final safety: soft clipper keeps output inside [-0.98, 0.98] even if the limiter overshoots.
  const clip = ctx.createWaveShaper();
  const cc = new Float32Array(new ArrayBuffer(4097 * 4));
  for (let i = 0; i < 4097; i++) {
    const x = (i / 4096) * 4 - 2;
    const a = Math.abs(x);
    const y = a <= 0.8 ? a : 0.8 + 0.18 * Math.tanh((a - 0.8) / 0.18);
    cc[i] = Math.sign(x) * y;
  }
  clip.curve = cc;
  clip.oversample = "none";
  const pre = ctx.createGain();
  pre.gain.value = 0.5;
  masterIn.connect(lowShelf).connect(highShelf).connect(tapeLp);
  tapeLp.connect(satDry).connect(glue);
  tapeLp.connect(satPre).connect(satShaper).connect(satOut).connect(glue);
  glue.connect(makeup).connect(limiter).connect(out).connect(pre).connect(clip);
  let analyser: AnalyserNode | null = null;
  if (withAnalyser) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    clip.connect(analyser);
    analyser.connect(ctx.destination);
  } else clip.connect(ctx.destination);

  // shared reverb (type-dependent impulse) + delay (throw amount + tone automated)
  const revIn = ctx.createGain();
  const revHp = ctx.createBiquadFilter();
  revHp.type = "highpass";
  revHp.frequency.value = 200;
  const revOut = ctx.createGain();
  revOut.gain.value = 0.9;
  let reverb = ctx.createConvolver();
  let reverbId: ReverbId = "hall";
  reverb.buffer = impulse(ctx, IR.hall);
  revIn.connect(revHp).connect(reverb).connect(revOut).connect(masterIn);

  const delay = ctx.createDelay(2);
  delay.delayTime.value = 0.35;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const dlyLp = ctx.createBiquadFilter();
  dlyLp.type = "lowpass";
  dlyLp.frequency.value = 3200;
  const dlyIn = ctx.createGain();
  const dlySend = ctx.createGain();
  const dlyOut = ctx.createGain();
  dlyOut.gain.value = 0.6;
  dlyIn.connect(dlySend).connect(delay);
  delay.connect(dlyLp).connect(fb).connect(delay);
  dlyLp.connect(dlyOut).connect(masterIn);
  dlyOut.connect(revIn);

  const crushCurve = stepCurve(7);
  let drumRevMul = 1;
  let fbScale = 1;
  let delayBeats = 0.75;
  let lastMix: MixParams | null = null;

  const stems = {} as Record<StemId, StemBus>;
  let crushWet: GainNode | null = null;
  STEM_IDS.forEach((id, idx) => {
    const input = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 18000;
    tone.Q.value = 0.5;
    const auto = ctx.createBiquadFilter();
    auto.type = "lowpass";
    auto.frequency.value = 20000;
    auto.Q.value = 0.7;
    const pump = ctx.createGain();
    const dry = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    shaper.curve = voice.shaperCurve;
    shaper.oversample = SHAPER_OVERSAMPLE;
    const gritPre = ctx.createGain();
    gritPre.gain.value = 2;
    const gritOut = ctx.createGain();
    gritOut.gain.value = 0;
    const level = ctx.createGain();
    level.gain.value = BASE_LEVEL[id];
    input.connect(tone).connect(auto);
    if (id === "drums") {
      // optional bit-crush (stepped waveshaper) in parallel
      const crush = ctx.createWaveShaper();
      crush.curve = crushCurve;
      const wet = ctx.createGain();
      wet.gain.value = 0;
      auto.connect(crush).connect(wet).connect(pump);
      crushWet = wet;
    }
    auto.connect(pump);
    pump.connect(dry).connect(level);
    pump.connect(gritPre).connect(shaper).connect(gritOut).connect(level);
    level.connect(masterIn);
    // stereo width: Haas-delayed, high-passed mono copy added as +L / -R (side). Mono sum is unchanged.
    const mono = ctx.createGain();
    mono.channelCount = 1;
    mono.channelCountMode = "explicit";
    mono.channelInterpretation = "speakers";
    const haas = ctx.createDelay(0.05);
    haas.delayTime.value = 0.009 + idx * 0.0027;
    const sideHp = ctx.createBiquadFilter();
    sideHp.type = "highpass";
    sideHp.frequency.value = 280;
    const side = ctx.createGain();
    side.gain.value = 0;
    const inv = ctx.createGain();
    inv.gain.value = -1;
    const merger = ctx.createChannelMerger(2);
    level.connect(mono).connect(haas).connect(sideHp).connect(side);
    side.connect(merger, 0, 0);
    side.connect(inv).connect(merger, 0, 1);
    merger.connect(masterIn);
    const rev = ctx.createGain();
    const dly = ctx.createGain();
    level.connect(rev).connect(revIn);
    level.connect(dly).connect(dlyIn);
    stems[id] = { input, tone, auto, pump, dry, gritOut, level, side, rev, dly };
  });

  const live = "currentTime" in ctx && !(typeof OfflineAudioContext !== "undefined" && ctx instanceof OfflineAudioContext);
  const setParam = (p: AudioParam, v: number, smooth: boolean) => {
    if (smooth && live) {
      const now = ctx.currentTime;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(v, now + 0.08);
    } else p.value = v;
  };

  const autoTargets = (a: AutoValues) => {
    const list: [AudioParam, number, boolean][] = []; // param, value, exponential
    for (const id of AUTO_FILTERED) {
      list.push([stems[id].auto.frequency, Math.min(filterHz(a.filter), ctx.sampleRate * 0.45), true]);
      list.push([stems[id].auto.Q, Math.max(0.3, a.res), false]);
    }
    list.push([stems.drums.auto.frequency, Math.min(filterHz(a.drumFilter), ctx.sampleRate * 0.45), true]);
    for (const id of STEM_IDS) list.push([stems[id].side.gain, Math.max(0, a.width) * WIDTH_AMT[id], false]);
    list.push([satOut.gain, Math.max(0, a.sat) * 0.55, false]);
    list.push([satDry.gain, 1 - Math.max(0, a.sat) * 0.3, false]);
    list.push([dlySend.gain, Math.max(0, a.delay), false]);
    list.push([dlyLp.frequency, a.delay > 1.5 ? 1300 : 3200, true]);
    return list;
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
    pumpOn: false,
    setTempo(bpm) {
      delay.delayTime.value = delayBeats > 0 ? Math.min(1.5, (60 / bpm) * delayBeats) : 0.11;
    },
    applyFx(fx, mix, bpm) {
      if (fx.reverb !== reverbId) {
        const next = ctx.createConvolver();
        next.buffer = impulse(ctx, IR[fx.reverb]);
        revHp.disconnect();
        revHp.connect(next).connect(revOut);
        const old = reverb;
        reverb = next;
        reverbId = fx.reverb;
        setTimeout(() => old.disconnect(), 50);
      }
      delayBeats = DELAY_BEATS[fx.delay];
      fbScale = fx.delay === "slap" ? 0.3 : 1;
      g.setTempo(bpm);
      if (crushWet) crushWet.gain.value = fx.crush ? 0.55 : 0;
      tapeLp.frequency.value = fx.tape ? 11500 : 20000;
      satPre.gain.value = fx.tape ? 1.9 : 1.4;
      g.pumpOn = fx.pump;
      drumRevMul = mix.drums === "dry" ? 0.15 : 1.7;
      if (lastMix) g.setMix(lastMix);
    },
    setAuto(a, when) {
      for (const [p, v] of autoTargets(a)) p.setValueAtTime(v, when);
    },
    rampAuto(a, when) {
      for (const [p, v, exp] of autoTargets(a)) {
        if (exp) p.exponentialRampToValueAtTime(Math.max(20, v), when);
        else p.linearRampToValueAtTime(v, when);
      }
    },
    cancelAuto(when) {
      for (const [p] of autoTargets({ filter: 1, res: 0.7, width: 0.5, sat: 0.1, delay: 1, drumFilter: 1 })) p.cancelScheduledValues(when);
    },
    setMix(m, smooth = false) {
      lastMix = m;
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
        setParam(s.rev.gain, REV_AMT[id] * Math.pow(space, 1.3) * 1.6 * (id === "drums" ? drumRevMul : 1), smooth);
        setParam(s.dly.gain, DLY_AMT[id] * space * 1.4, smooth);
        const ga = GRIT_AMT[id] * grit;
        setParam(s.gritOut.gain, ga * 0.55, smooth);
        setParam(s.dry.gain, 1 - ga * 0.45, smooth);
        if (id === "lead") setParam(s.tone.frequency, 1600 + Math.pow(vc, 1.5) * 12000, smooth);
        if (id === "harmony") setParam(s.tone.frequency, 3500 + (m.genrePull / 100) * 12000, smooth);
      }
      setParam(fb.gain, (0.18 + space * 0.3) * fbScale, smooth);
      setParam(lowShelf.gain, (bass - 0.5) * 9, smooth);
      setParam(highShelf.gain, -2 + (m.genrePull / 100) * 3 - grit * 1.5, smooth);
    },
  };
  return g;
}

const PUMPED: StemId[] = ["bass", "harmony", "texture"];

export function scheduleEvent(g: Graph, ev: NoteEvent, when: number, beatSec: number, dest?: AudioNode) {
  playEvent(g.voice, ev, when, beatSec, dest ?? g.stems[ev.stem].input);
  if (ev.stem === "drums" && ev.inst === "kick" && ev.vel > 0.4) pumpKick(g, when, beatSec);
}

/** Sidechain duck on a kick. Kicks closer than 60 ms to the previous duck are skipped so the
 *  gain automation never gets overlapping/out-of-order target events. */
export function pumpKick(g: Graph, when: number, beatSec: number) {
  if (!g.pumpOn) return;
  const last = pumpLast.get(g) ?? -Infinity;
  if (when >= last && when < last + 0.06) return;
  pumpLast.set(g, when);
  for (const id of PUMPED) {
    const p = g.stems[id].pump.gain;
    p.setTargetAtTime(0.38, when, 0.004);
    p.setTargetAtTime(1, when + 0.03, beatSec * 0.14);
  }
}
const pumpLast = new WeakMap<Graph, number>();

/** Interpolated automation values at a beat. */
export function autoAt(song: Song, beat: number): AutoValues {
  const pts = song.automation;
  const strip = (p: AutoPoint): AutoValues => ({ filter: p.filter, res: p.res, width: p.width, sat: p.sat, delay: p.delay, drumFilter: p.drumFilter });
  if (!pts.length) return { filter: 1, res: 0.7, width: 0.6, sat: 0.1, delay: 1, drumFilter: 1 };
  if (beat <= pts[0].beat) return strip(pts[0]);
  for (let i = 1; i < pts.length; i++) {
    if (beat < pts[i].beat) {
      const a = pts[i - 1];
      const b = pts[i];
      const u = (beat - a.beat) / Math.max(1e-6, b.beat - a.beat);
      const lerp = (x: number, y: number) => x + (y - x) * u;
      return { filter: lerp(a.filter, b.filter), res: lerp(a.res, b.res), width: lerp(a.width, b.width), sat: lerp(a.sat, b.sat), delay: lerp(a.delay, b.delay), drumFilter: lerp(a.drumFilter, b.drumFilter) };
    }
  }
  return strip(pts[pts.length - 1]);
}

/** Schedule the song's production automation from `fromBeat` (beat 0 of the timeline maps to when0). */
export function scheduleAutomation(g: Graph, song: Song, fromBeat: number, when0: number, beatSec: number, untilBeat = Infinity) {
  g.setAuto(autoAt(song, fromBeat), when0 + fromBeat * beatSec);
  for (const p of song.automation) {
    if (p.beat <= fromBeat || p.beat > untilBeat) continue;
    g.rampAuto(p, when0 + p.beat * beatSec);
  }
}

/** Browsers oversample the grit shaper 2x. Under Node (offline test harness, node-web-audio-api 2.2.0) the
 *  2x resampler can panic ("Imaginary part of first value was non-zero") and drop the node, so it is off there. */
export const SHAPER_OVERSAMPLE: OverSampleType = typeof window === "undefined" ? "none" : "2x";

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
  g.applyFx(song.spec.production.fx, song.spec.production.mix, song.bpm);
  g.setTempo(song.bpm);
  g.setMix(mix);
  const start = 0.05;
  scheduleAutomation(g, song, startBeat, start - startBeat * beatSec, beatSec, startBeat + seconds / beatSec);
  const want = opts.stems ? new Set(opts.stems) : null;
  for (const ev of song.events) {
    if (ev.t < startBeat) continue;
    const when = start + (ev.t - startBeat) * beatSec;
    if (when > seconds) break;
    // kicks still drive the sidechain pump on stem-only renders
    if (want && !want.has(ev.stem)) {
      if (ev.inst === "kick" && ev.stem === "drums" && ev.vel > 0.4) pumpKick(g, when, beatSec);
      continue;
    }
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
