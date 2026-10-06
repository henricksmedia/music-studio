/**
 * Synthesized instruments. Every voice is built from Web Audio nodes on any BaseAudioContext,
 * so the exact same code drives live playback and offline (export/test) rendering.
 */
import type { NoteEvent } from "./compose";
import { midiToFreq } from "./theory";

export type VoiceCtx = {
  ctx: BaseAudioContext;
  noise: AudioBuffer;
  crackle: AudioBuffer;
  waves: Map<string, PeriodicWave>;
  ks: Map<string, AudioBuffer>;
  shaperCurve: Float32Array<ArrayBuffer>;
  hardCurve: Float32Array<ArrayBuffer>;
};

export function makeVoiceCtx(ctx: BaseAudioContext): VoiceCtx {
  const sr = ctx.sampleRate;
  const noise = ctx.createBuffer(1, sr * 2, sr);
  const nd = noise.getChannelData(0);
  let seed = 1234567;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < nd.length; i++) nd[i] = rnd() * 2 - 1;
  const crackle = ctx.createBuffer(1, sr * 3, sr);
  const cd = crackle.getChannelData(0);
  for (let i = 0; i < cd.length; i++) {
    cd[i] = (rnd() * 2 - 1) * 0.04; // hiss
    if (rnd() < 0.0009) {
      const amp = rnd() * 0.9;
      for (let k = 0; k < 30 && i + k < cd.length; k++) cd[i + k] += amp * Math.exp(-k / 5) * (k % 2 ? -1 : 1);
    }
  }
  return { ctx, noise, crackle, waves: new Map(), ks: new Map(), shaperCurve: curve(4), hardCurve: curve(14) };
}

function curve(k: number): Float32Array<ArrayBuffer> {
  const n = 2049; // odd length: input 0 maps exactly to output 0 (no DC leak)
  const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}

function wave(v: VoiceCtx, name: string, harmonics: number[]): PeriodicWave {
  let w = v.waves.get(name);
  if (!w) {
    const real = new Float32Array(harmonics.length + 1);
    const imag = new Float32Array(harmonics.length + 1);
    harmonics.forEach((h, i) => (imag[i + 1] = h));
    w = v.ctx.createPeriodicWave(real, imag);
    v.waves.set(name, w);
  }
  return w;
}

/** Karplus–Strong plucked string, pre-rendered to a buffer (cached). */
function ksBuffer(v: VoiceCtx, freq: number, seconds: number, kind: "guitar" | "banjo" | "bass" | "nylon"): AudioBuffer {
  const sr = v.ctx.sampleRate;
  const len = Math.min(5, Math.max(0.5, Math.ceil(seconds * 2) / 2));
  const key = `${kind}|${Math.round(freq * 4)}|${len}`;
  const hit = v.ks.get(key);
  if (hit) return hit;
  const s = kind === "banjo" ? 0.18 : kind === "guitar" ? 0.35 : kind === "nylon" ? 0.5 : 0.5;
  const decay = kind === "banjo" ? 0.991 : kind === "bass" ? 0.996 : kind === "nylon" ? 0.996 : 0.9975;
  const N = Math.max(2, Math.round(sr / freq - s));
  const total = Math.floor(sr * len);
  const buf = v.ctx.createBuffer(1, total, sr);
  const y = buf.getChannelData(0);
  let seed = Math.round(freq * 1000) + kind.length;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  // excitation: noise, softened for warmer kinds
  let prev = 0;
  const soft = kind === "banjo" ? 0.1 : kind === "bass" ? 0.7 : kind === "nylon" ? 0.6 : 0.35;
  for (let i = 0; i < N && i < total; i++) {
    const x = rnd();
    prev = prev * soft + x * (1 - soft);
    y[i] = prev;
  }
  // per-sample decay tuned so higher notes don't die instantly
  const d = Math.pow(decay, 440 / Math.max(80, freq) * 0.35 + 0.65);
  for (let i = N; i < total; i++) {
    y[i] = d * ((1 - s) * y[i - N] + s * y[i - N - 1 >= 0 ? i - N - 1 : 0]);
  }
  // normalize
  let peak = 0;
  for (let i = 0; i < Math.min(total, N * 8); i++) peak = Math.max(peak, Math.abs(y[i]));
  if (peak > 0) for (let i = 0; i < total; i++) y[i] /= peak;
  if (v.ks.size > 400) v.ks.clear();
  v.ks.set(key, buf);
  return buf;
}

type Env = { a: number; d: number; s: number; r: number };

function envGain(v: VoiceCtx, out: AudioNode, when: number, dur: number, peak: number, e: Env): GainNode {
  // Explicit ramps only (no setTargetAtTime): identical behavior in browsers and the offline test renderer.
  const g = v.ctx.createGain();
  g.gain.value = 0; // silent until the note starts (default gain 1 would pass anything upstream)
  const p = g.gain;
  const pk = Math.max(1e-4, peak);
  const sus = Math.max(1e-4, pk * e.s);
  p.setValueAtTime(0, when);
  p.linearRampToValueAtTime(pk, when + e.a);
  const relAt = Math.max(when + e.a + 0.001, when + dur);
  let level = pk;
  if (e.d > 0 && e.s < 1) {
    const decEnd = when + e.a + e.d;
    if (relAt >= decEnd) {
      p.exponentialRampToValueAtTime(sus, decEnd);
      level = sus;
    } else {
      const frac = (relAt - when - e.a) / e.d;
      level = pk * Math.pow(sus / pk, frac);
      p.exponentialRampToValueAtTime(Math.max(1e-4, level), relAt);
    }
  }
  p.setValueAtTime(Math.max(1e-4, level), relAt);
  p.exponentialRampToValueAtTime(1e-4, relAt + Math.max(0.01, e.r));
  p.setValueAtTime(0, relAt + Math.max(0.01, e.r) + 0.005);
  g.connect(out);
  return g;
}

function osc(v: VoiceCtx, type: OscillatorType | PeriodicWave, freq: number, when: number, stop: number, detune = 0): OscillatorNode {
  const o = v.ctx.createOscillator();
  if (typeof type === "string") o.type = type as OscillatorType;
  else o.setPeriodicWave(type);
  o.frequency.setValueAtTime(freq, when);
  if (detune) o.detune.setValueAtTime(detune, when);
  o.start(when);
  o.stop(stop);
  return o;
}

function noiseSrc(v: VoiceCtx, when: number, stop: number, buf?: AudioBuffer, loop = true): AudioBufferSourceNode {
  const n = v.ctx.createBufferSource();
  n.buffer = buf ?? v.noise;
  n.loop = loop;
  const offset = ((when * 7.13) % 1.5) || 0;
  n.start(when, offset);
  n.stop(stop);
  return n;
}

function filt(v: VoiceCtx, type: BiquadFilterType, freq: number, q = 0.7, when = 0): BiquadFilterNode {
  const f = v.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, when);
  f.Q.setValueAtTime(q, when);
  return f;
}

function pan(v: VoiceCtx, out: AudioNode, p: number): AudioNode {
  if (!p || !("createStereoPanner" in v.ctx)) return out;
  const s = v.ctx.createStereoPanner();
  s.pan.value = Math.max(-1, Math.min(1, p));
  s.connect(out);
  return s;
}

function vibrato(v: VoiceCtx, target: AudioParam, when: number, stop: number, rate: number, cents: number, delay = 0.15) {
  const l = v.ctx.createOscillator();
  l.frequency.value = rate;
  const g = v.ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(cents, when + delay + 0.2);
  l.connect(g);
  g.connect(target);
  l.start(when);
  l.stop(stop);
}

/* ============================== DRUMS ============================== */

function drum(v: VoiceCtx, ev: NoteEvent, when: number, out: AudioNode) {
  const kit = ev.kit ?? "electronic";
  const vel = ev.vel;
  const c = v.ctx;
  switch (ev.inst) {
    case "kick": {
      const params =
        kit === "808"
          ? { f0: 170, f1: 48, pt: 0.05, dec: 0.32, click: 0.4 }
          : kit === "acoustic" || kit === "brush"
            ? { f0: 120, f1: 55, pt: 0.06, dec: kit === "brush" ? 0.25 : 0.32, click: 0.5 }
            : kit === "lofi"
              ? { f0: 110, f1: 50, pt: 0.07, dec: 0.3, click: 0.2 }
              : kit === "cinematic"
                ? { f0: 90, f1: 38, pt: 0.12, dec: 0.9, click: 0.3 }
                : { f0: 150, f1: 45, pt: 0.055, dec: 0.42, click: 0.35 };
      const end = when + params.dec + 0.1;
      const o = osc(v, "sine", params.f0, when, end);
      o.frequency.exponentialRampToValueAtTime(params.f1, when + params.pt);
      const g = c.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vel * 0.85, when + 0.003);
      g.gain.exponentialRampToValueAtTime(1e-4, when + 0.02 + (params.dec / 3.5) * 5);
      o.connect(g).connect(out);
      const n = noiseSrc(v, when, when + 0.03);
      const nf = filt(v, "highpass", 2500);
      const ng = envGain(v, out, when, 0.005, vel * params.click * 0.5, { a: 0.001, d: 0.01, s: 0, r: 0.01 });
      n.connect(nf).connect(ng);
      break;
    }
    case "snare": {
      const gated = kit === "gated";
      const brush = kit === "brush";
      const dec = gated ? 0.32 : brush ? 0.22 : kit === "lofi" ? 0.16 : 0.18;
      const n = noiseSrc(v, when, when + dec + 0.25);
      const bp = filt(v, brush ? "bandpass" : "highpass", brush ? 3500 : 1200, brush ? 0.6 : 0.5);
      const lp = filt(v, "lowpass", kit === "lofi" ? 5000 : 9000);
      const peak = vel * (brush ? 0.65 : 0.75);
      const g = c.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(peak, when + (brush ? 0.015 : 0.002));
      if (gated) {
        g.gain.setValueAtTime(peak * 0.8, when + dec);
        g.gain.linearRampToValueAtTime(0, when + dec + 0.02);
      } else g.gain.exponentialRampToValueAtTime(1e-4, when + 0.01 + (dec / 3.5) * 5);
      n.connect(bp).connect(lp).connect(g).connect(out);
      if (!brush) {
        const o = osc(v, "triangle", 190, when, when + 0.15);
        o.frequency.exponentialRampToValueAtTime(140, when + 0.08);
        const og = envGain(v, out, when, 0.01, vel * 0.45, { a: 0.001, d: 0.08, s: 0, r: 0.05 });
        o.connect(og);
      }
      break;
    }
    case "clap": {
      const n = noiseSrc(v, when, when + 0.4);
      const bp = filt(v, "bandpass", 1300, 1.2);
      const g = c.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0, when);
      for (let i = 0; i < 3; i++) {
        g.gain.linearRampToValueAtTime(vel * 0.8, when + i * 0.011 + 0.001);
        g.gain.linearRampToValueAtTime(vel * 0.15, when + i * 0.011 + 0.009);
      }
      g.gain.linearRampToValueAtTime(vel * 0.7, when + 0.035);
      g.gain.exponentialRampToValueAtTime(1e-4, when + 0.04 + (0.05) * 5);
      n.connect(bp).connect(g).connect(pan(v, out, 0.05));
      break;
    }
    case "hatC":
    case "hatO":
    case "shaker": {
      const open = ev.inst === "hatO";
      const sh = ev.inst === "shaker";
      const dec = open ? 0.28 : sh ? 0.07 : kit === "lofi" ? 0.035 : 0.045;
      const n = noiseSrc(v, when, when + dec + 0.2);
      const hp = filt(v, "highpass", sh ? 5500 : 7500);
      const bp = filt(v, "peaking", 10000, 1);
      bp.gain.value = 4;
      const lp = filt(v, "lowpass", kit === "lofi" ? 7000 : 16000);
      const g = c.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vel * (sh ? 0.28 : 0.38), when + (sh ? 0.012 : 0.001));
      g.gain.exponentialRampToValueAtTime(1e-4, when + 0.005 + (dec / 3) * 5);
      n.connect(hp).connect(bp).connect(lp).connect(g).connect(pan(v, out, sh ? -0.3 : 0.25));
      break;
    }
    case "ride": {
      const ratios = [1, 1.47, 1.98, 2.53];
      const g = envGain(v, pan(v, out, 0.3), when, 0.01, vel * 0.15, { a: 0.001, d: 0.6, s: 0, r: 0.3 });
      const hp = filt(v, "highpass", 3000);
      hp.connect(g);
      for (const r of ratios) osc(v, "square", 420 * r, when, when + 1).connect(hp);
      const n = noiseSrc(v, when, when + 0.4);
      const nh = filt(v, "highpass", 8000);
      const ng = envGain(v, pan(v, out, 0.3), when, 0.01, vel * 0.18, { a: 0.001, d: 0.15, s: 0, r: 0.1 });
      n.connect(nh).connect(ng);
      break;
    }
    case "crash": {
      const n = noiseSrc(v, when, when + 2.5);
      const hp = filt(v, "highpass", 4500);
      const g = envGain(v, pan(v, out, -0.2), when, 0.01, vel * 0.32, { a: 0.002, d: 1.4, s: 0, r: 0.6 });
      n.connect(hp).connect(g);
      break;
    }
    case "tom": {
      const big = kit === "cinematic";
      const f = big ? 70 + (ev.midi % 5) * 6 : midiToFreq(ev.midi || 45);
      const dec = big ? 0.7 : 0.3;
      const o = osc(v, "sine", f * 1.6, when, when + dec + 0.1);
      o.frequency.exponentialRampToValueAtTime(f, when + 0.06);
      const g = envGain(v, pan(v, out, ((ev.midi % 3) - 1) * 0.3), when, 0.01, vel * (big ? 0.9 : 0.6), { a: 0.002, d: dec, s: 0, r: 0.1 });
      o.connect(g);
      if (big) {
        const n = noiseSrc(v, when, when + 0.2);
        const lp = filt(v, "lowpass", 900);
        const ng = envGain(v, out, when, 0.01, vel * 0.5, { a: 0.001, d: 0.12, s: 0, r: 0.05 });
        n.connect(lp).connect(ng);
      }
      break;
    }
    case "rim": {
      const o = osc(v, "triangle", 820, when, when + 0.06);
      const g = envGain(v, pan(v, out, -0.15), when, 0.005, vel * 0.35, { a: 0.001, d: 0.03, s: 0, r: 0.02 });
      o.connect(g);
      break;
    }
    case "perc": {
      const o = osc(v, "sine", 330, when, when + 0.25);
      o.frequency.exponentialRampToValueAtTime(220, when + 0.08);
      const g = envGain(v, pan(v, out, 0.35), when, 0.01, vel * 0.35, { a: 0.002, d: 0.15, s: 0, r: 0.05 });
      o.connect(g);
      break;
    }
  }
}

/* ============================== TONAL ============================== */

function tonal(v: VoiceCtx, ev: NoteEvent, when: number, beatSec: number, out: AudioNode) {
  const c = v.ctx;
  const f = midiToFreq(ev.midi);
  const dur = Math.max(0.05, ev.dur * beatSec);
  const vel = ev.vel;
  const end = (r: number) => when + dur + r + 0.05;
  const isLead = ev.stem === "lead";
  const panAmt = ev.stem === "harmony" ? ((ev.midi % 5) - 2) * 0.12 : 0;
  const dest = pan(v, out, panAmt);

  const applyGlide = (p: AudioParam) => {
    if (!ev.glide) return;
    const target = f * Math.pow(2, ev.glide / 12);
    if (isLead) {
      p.setValueAtTime(f, when + 0.04);
      p.exponentialRampToValueAtTime(target, when + Math.min(0.25, dur * 0.5));
    } else {
      p.setValueAtTime(f, when + dur * 0.55);
      p.exponentialRampToValueAtTime(target, when + dur * 0.85);
    }
  };

  switch (ev.inst) {
    /* ---- bass ---- */
    case "sub": {
      const g = envGain(v, dest, when, dur, vel * 0.32, { a: 0.008, d: 0.2, s: 0.9, r: 0.08 });
      const o = osc(v, wave(v, "sub", [1, 0.15]), f, when, end(0.1));
      applyGlide(o.frequency);
      o.connect(g);
      break;
    }
    case "saw":
    case "square":
    case "acid": {
      const g = envGain(v, dest, when, dur, vel * (ev.inst === "acid" ? 0.34 : 0.38), { a: 0.005, d: 0.25, s: 0.7, r: 0.06 });
      const lp = filt(v, "lowpass", 300, ev.inst === "acid" ? 14 : 3, when);
      const peakF = ev.inst === "acid" ? 900 + vel * 2500 : 1200;
      lp.frequency.setValueAtTime(ev.inst === "acid" ? 200 : 300, when);
      lp.frequency.linearRampToValueAtTime(peakF, when + 0.01);
      lp.frequency.exponentialRampToValueAtTime(Math.max(1e-4, ev.inst === "acid" ? 260 : 380), when + 0.012 + (ev.inst === "acid" ? 0.08 : 0.12) * 3);
      lp.connect(g);
      const o = osc(v, ev.inst === "square" ? "square" : "sawtooth", f, when, end(0.08));
      applyGlide(o.frequency);
      o.connect(lp);
      if (ev.inst === "saw") {
        const s = osc(v, "sine", f / 2, when, end(0.08));
        const sg = c.createGain();
        sg.gain.value = 0.5;
        s.connect(sg).connect(g);
      }
      break;
    }
    case "reese": {
      const g = envGain(v, dest, when, dur, vel * 0.24, { a: 0.02, d: 0.3, s: 0.9, r: 0.1 });
      const lp = filt(v, "lowpass", 520, 2);
      lp.connect(g);
      for (const d of [-14, 14]) osc(v, "sawtooth", f, when, end(0.1), d).connect(lp);
      const s = osc(v, "sine", f / 2, when, end(0.1));
      const sg = c.createGain();
      sg.gain.value = 0.8;
      s.connect(sg).connect(g);
      break;
    }
    case "808": {
      const g = envGain(v, dest, when, dur, vel * 0.22, { a: 0.004, d: Math.max(0.4, dur), s: 0.6, r: 0.12 });
      const sh = c.createWaveShaper();
      sh.curve = v.shaperCurve;
      const o = osc(v, "sine", f * 1.8, when, end(0.15));
      o.frequency.exponentialRampToValueAtTime(f, when + 0.04);
      if (ev.glide) {
        const target = f * Math.pow(2, ev.glide / 12);
        o.frequency.setValueAtTime(f, when + dur * 0.5);
        o.frequency.exponentialRampToValueAtTime(target, when + dur * 0.8);
      }
      const pre = c.createGain();
      pre.gain.value = 1.4;
      o.connect(pre).connect(sh).connect(g);
      break;
    }
    case "upright":
    case "pluck": {
      if (ev.stem === "bass") {
        const buf = ksBuffer(v, f, dur + 0.3, "bass");
        const src = c.createBufferSource();
        src.buffer = buf;
        const lp = filt(v, "lowpass", ev.inst === "upright" ? 700 : 1400, 0.8);
        const g = envGain(v, dest, when, dur, vel * 0.6, { a: 0.003, d: 0, s: 1, r: 0.07 });
        src.connect(lp).connect(g);
        src.start(when);
        src.stop(end(0.1));
        const s = osc(v, "sine", f, when, end(0.08));
        const sg = envGain(v, dest, when, dur, vel * 0.28, { a: 0.006, d: 0.5, s: 0.5, r: 0.07 });
        s.connect(sg);
      } else {
        // synth pluck lead / harmony
        const g = envGain(v, dest, when, Math.min(dur, 0.35), vel * 0.4, { a: 0.003, d: 0.25, s: 0.2, r: 0.2 });
        const lp = filt(v, "lowpass", 400, 4, when);
        lp.frequency.setValueAtTime(5000, when);
        lp.frequency.exponentialRampToValueAtTime(Math.max(1e-4, 700), when + 0.005 + (0.08) * 3);
        lp.connect(g);
        osc(v, "sawtooth", f, when, end(0.3), -6).connect(lp);
        osc(v, "square", f, when, end(0.3), 6).connect(lp);
      }
      break;
    }
    case "fm": {
      const g = envGain(v, dest, when, dur, vel * 0.42, { a: 0.004, d: 0.3, s: 0.7, r: 0.08 });
      const car = osc(v, "sine", f, when, end(0.1));
      const mod = osc(v, "sine", f, when, end(0.1));
      const mg = c.createGain();
      mg.gain.setValueAtTime(f * 2.2, when);
      mg.gain.exponentialRampToValueAtTime(Math.max(1e-4, f * 0.5), when + 0.01 + (0.08) * 3);
      mod.connect(mg).connect(car.frequency);
      applyGlide(car.frequency);
      car.connect(g);
      break;
    }

    /* ---- keys / pads ---- */
    case "pad":
    case "choir": {
      const choir = ev.inst === "choir";
      const atk = Math.min(dur * 0.4, choir ? 0.5 : 0.7);
      const g = envGain(v, dest, when, dur, vel * (choir ? 0.22 : 0.18), { a: atk, d: 0, s: 1, r: Math.min(1.5, 0.4 + dur * 0.2) });
      let node: AudioNode = g;
      if (choir) {
        const mix = c.createGain();
        mix.gain.value = 1;
        for (const [fr, q, gn] of [[700, 6, 1], [1150, 8, 0.6], [2700, 10, 0.25]] as const) {
          const bp = filt(v, "bandpass", fr, q);
          const bg = c.createGain();
          bg.gain.value = gn * 2.2;
          mix.connect(bp).connect(bg).connect(g);
        }
        node = mix;
      } else {
        const lp = filt(v, "lowpass", 1400, 0.8);
        const lfo = c.createOscillator();
        lfo.frequency.value = 0.25;
        const lg = c.createGain();
        lg.gain.value = 500;
        lfo.connect(lg).connect(lp.frequency);
        lfo.start(when);
        lfo.stop(end(1.5));
        lp.connect(g);
        node = lp;
      }
      for (const d of [-9, 0, 9]) {
        const o = osc(v, "sawtooth", f, when, end(1.6), d);
        if (choir) vibrato(v, o.detune, when, end(1.6), 5, 12, 0.3);
        o.connect(node);
      }
      break;
    }
    case "supersaw": {
      const g = envGain(v, dest, when, dur, vel * 0.11, { a: 0.008, d: 0.15, s: 0.8, r: 0.18 });
      const lp = filt(v, "lowpass", 5200, 0.6);
      lp.connect(g);
      for (const d of [-22, -11, 0, 11, 22]) osc(v, "sawtooth", f, when, end(0.25), d).connect(lp);
      break;
    }
    case "strings":
    case "brass": {
      const brass = ev.inst === "brass";
      const atk = brass ? 0.06 : Math.min(dur * 0.35, isLead ? 0.12 : 0.45);
      const g = envGain(v, dest, when, dur, vel * (isLead ? 0.2 : 0.18), { a: atk, d: 0.3, s: 0.85, r: brass ? 0.15 : 0.5 });
      const lp = filt(v, "lowpass", brass ? 600 : 3200, brass ? 1.5 : 0.6, when);
      if (brass) {
        lp.frequency.linearRampToValueAtTime(2600 * (0.6 + vel * 0.6), when + 0.08);
        lp.frequency.exponentialRampToValueAtTime(Math.max(1e-4, 1500), when + 0.1 + (0.3) * 3);
      }
      lp.connect(g);
      for (const d of brass ? [-5, 5] : [-8, 0, 8]) {
        const o = osc(v, "sawtooth", f, when, end(0.6), d);
        vibrato(v, o.detune, when, end(0.6), brass ? 5 : 5.5, isLead ? 14 : 7, isLead ? 0.25 : 0.4);
        applyGlide(o.frequency);
        o.connect(lp);
      }
      break;
    }
    case "organ": {
      const g = envGain(v, dest, when, dur, vel * 0.2, { a: 0.012, d: 0, s: 1, r: 0.08 });
      const trem = c.createGain();
      const lfo = c.createOscillator();
      lfo.frequency.value = 6.2;
      const lg = c.createGain();
      lg.gain.value = 0.18;
      lfo.connect(lg).connect(trem.gain);
      trem.gain.value = 0.82;
      lfo.start(when);
      lfo.stop(end(0.1));
      trem.connect(g);
      osc(v, wave(v, "organ", [1, 0.8, 0.55, 0.4, 0, 0.25, 0, 0.18]), f, when, end(0.1)).connect(trem);
      break;
    }
    case "piano": {
      const decay = Math.max(0.6, 2.6 - (ev.midi - 48) * 0.035);
      const g = envGain(v, dest, when, dur, vel * (isLead ? 0.5 : 0.34), { a: 0.002, d: decay, s: 0.0, r: 0.25 });
      const lp = filt(v, "lowpass", 1200, 0.5, when);
      lp.frequency.setValueAtTime(1500 + vel * 4500, when);
      lp.frequency.exponentialRampToValueAtTime(Math.max(1e-4, 900), when + 0.01 + (decay / 3) * 3);
      lp.connect(g);
      const w = wave(v, "piano", [1, 0.55, 0.32, 0.22, 0.12, 0.09, 0.05, 0.04]);
      osc(v, w, f, when, end(0.3), -3).connect(lp);
      osc(v, w, f, when, end(0.3), 3).connect(lp);
      const n = noiseSrc(v, when, when + 0.03);
      const nb = filt(v, "bandpass", Math.min(8000, f * 4), 1);
      const ng = envGain(v, dest, when, 0.005, vel * 0.05, { a: 0.001, d: 0.01, s: 0, r: 0.01 });
      n.connect(nb).connect(ng);
      break;
    }
    case "epiano": {
      const decay = Math.max(0.8, 2.4 - (ev.midi - 48) * 0.03);
      const g = envGain(v, dest, when, dur, vel * (isLead ? 0.55 : 0.32), { a: 0.003, d: decay, s: 0.15, r: 0.3 });
      const car = osc(v, "sine", f, when, end(0.35));
      const mod = osc(v, "sine", f * 1, when, end(0.35));
      const mg = c.createGain();
      mg.gain.setValueAtTime(f * (0.8 + vel * 1.2), when);
      mg.gain.exponentialRampToValueAtTime(Math.max(1e-4, f * 0.1), when + 0.005 + (0.25) * 3);
      mod.connect(mg).connect(car.frequency);
      const tine = osc(v, "sine", f * 4, when, when + 0.4);
      const tg = envGain(v, g, when, 0.01, 0.15 * vel, { a: 0.001, d: 0.12, s: 0, r: 0.05 });
      tine.connect(tg);
      const trem = c.createGain();
      const lfo = c.createOscillator();
      lfo.frequency.value = 4.5;
      const lg = c.createGain();
      lg.gain.value = 0.12;
      lfo.connect(lg).connect(trem.gain);
      trem.gain.value = 0.88;
      lfo.start(when);
      lfo.stop(end(0.35));
      car.connect(trem).connect(g);
      break;
    }
    case "pluckArp": {
      const g = envGain(v, dest, when, Math.min(dur, 0.3), vel * 0.22, { a: 0.002, d: 0.18, s: 0.15, r: 0.25 });
      const lp = filt(v, "lowpass", 600, 5, when);
      lp.frequency.setValueAtTime(4500, when);
      lp.frequency.exponentialRampToValueAtTime(Math.max(1e-4, 650), when + 0.004 + (0.07) * 3);
      lp.connect(g);
      osc(v, "sawtooth", f, when, end(0.35), -7).connect(lp);
      osc(v, "sawtooth", f, when, end(0.35), 7).connect(lp);
      break;
    }

    /* ---- guitars ---- */
    case "strumGuitar": {
      const notes = ev.notes && ev.notes.length ? ev.notes : [ev.midi];
      const up = ev.variant === 1;
      const gap = up ? 0.009 : 0.014;
      const ringDur = dur + 0.35;
      notes.forEach((m, i) => {
        const t = when + i * gap;
        const buf = ksBuffer(v, midiToFreq(m), ringDur, "guitar");
        const src = c.createBufferSource();
        src.buffer = buf;
        const g = envGain(v, pan(v, out, (i / notes.length - 0.5) * 0.5), t, ringDur - 0.1, vel * 0.22 * (up ? 0.8 : 1), { a: 0.002, d: 0, s: 1, r: 0.12 });
        const body = filt(v, "peaking", 220, 1);
        body.gain.value = 4;
        const lp = filt(v, "lowpass", up ? 5500 : 4200);
        src.connect(body).connect(lp).connect(g);
        src.start(t);
        src.stop(t + ringDur + 0.2);
      });
      break;
    }
    case "cleanGuitar":
    case "guitar":
    case "banjo": {
      const kind = ev.inst === "banjo" ? "banjo" : "guitar";
      const ring = ev.inst === "banjo" ? Math.min(dur + 0.2, 1.2) : dur + 0.3;
      const buf = ksBuffer(v, f, ring, kind);
      const src = c.createBufferSource();
      src.buffer = buf;
      if (ev.glide) {
        src.playbackRate.setValueAtTime(1, when + 0.04);
        src.playbackRate.linearRampToValueAtTime(Math.pow(2, ev.glide / 12), when + Math.min(0.2, dur * 0.4));
      }
      const g = envGain(v, dest, when, ring - 0.1, vel * (isLead ? 0.85 : 0.4), { a: 0.002, d: 0, s: 1, r: 0.12 });
      const lp = filt(v, "lowpass", ev.inst === "banjo" ? 7000 : 4500);
      const pk = filt(v, "peaking", ev.inst === "banjo" ? 2500 : 900, 1.2);
      pk.gain.value = ev.inst === "banjo" ? 6 : 3;
      src.connect(pk).connect(lp).connect(g);
      src.start(when);
      src.stop(when + ring + 0.2);
      break;
    }
    case "distGuitar": {
      const muted = ev.variant === 1;
      const g = envGain(v, dest, when, dur, vel * (isLead ? 0.2 : 0.11), { a: 0.004, d: muted ? 0.08 : 0.6, s: muted ? 0.1 : 0.7, r: muted ? 0.04 : 0.15 });
      const cab = filt(v, "lowpass", muted ? 1800 : 3600, 0.9);
      const mid = filt(v, "peaking", 1400, 1);
      mid.gain.value = 3;
      const sh = c.createWaveShaper();
      sh.curve = v.hardCurve;
      sh.oversample = "2x";
      const pre = c.createGain();
      pre.gain.value = 2.5;
      pre.connect(sh).connect(mid).connect(cab).connect(g);
      for (const d of [-7, 7]) {
        const o = osc(v, "sawtooth", f, when, end(0.2), d);
        if (isLead) vibrato(v, o.detune, when, end(0.2), 5.5, 18, 0.3);
        applyGlide(o.frequency);
        o.connect(pre);
      }
      break;
    }

    /* ---- leads ---- */
    case "sawLead":
    case "squareLead":
    case "fmLead": {
      const g = envGain(v, dest, when, dur, vel * 0.14, { a: 0.008, d: 0.2, s: 0.75, r: 0.12 });
      const lp = filt(v, "lowpass", ev.inst === "squareLead" ? 2600 : 3800, 1.2);
      lp.connect(g);
      if (ev.inst === "fmLead") {
        const car = osc(v, "sine", f, when, end(0.15));
        const mod = osc(v, "sine", f * 2, when, end(0.15));
        const mg = c.createGain();
        mg.gain.setValueAtTime(f * 1.5, when);
        mg.gain.exponentialRampToValueAtTime(Math.max(1e-4, f * 0.6), when + 0.01 + (0.2) * 3);
        mod.connect(mg).connect(car.frequency);
        vibrato(v, car.detune, when, end(0.15), 5.5, 10);
        car.connect(lp);
      } else {
        for (const d of [-6, 6]) {
          const o = osc(v, ev.inst === "squareLead" ? "square" : "sawtooth", f, when, end(0.15), d);
          vibrato(v, o.detune, when, end(0.15), 5.5, 10);
          applyGlide(o.frequency);
          o.connect(lp);
        }
      }
      break;
    }
    case "acidLead": {
      const g = envGain(v, dest, when, dur, vel * 0.2, { a: 0.004, d: 0.15, s: 0.6, r: 0.06 });
      const lp = filt(v, "lowpass", 300, 16, when);
      lp.frequency.setValueAtTime(250, when);
      lp.frequency.linearRampToValueAtTime(800 + vel * 3500, when + 0.015);
      lp.frequency.exponentialRampToValueAtTime(Math.max(1e-4, 350), when + 0.02 + (0.09) * 3);
      const sh = c.createWaveShaper();
      sh.curve = v.shaperCurve;
      lp.connect(sh).connect(g);
      const o = osc(v, "sawtooth", f, when, end(0.1));
      applyGlide(o.frequency);
      o.connect(lp);
      break;
    }
    case "bell":
    case "shimmer": {
      const g = envGain(v, dest, when, dur, vel * (ev.inst === "shimmer" ? 0.12 : 0.28), { a: 0.002, d: 1.8, s: 0, r: 0.8 });
      const car = osc(v, "sine", f, when, end(1));
      const mod = osc(v, "sine", f * 3.5, when, end(1));
      const mg = c.createGain();
      mg.gain.setValueAtTime(f * 1.4, when);
      mg.gain.exponentialRampToValueAtTime(Math.max(1e-4, f * 0.05), when + 0.01 + (0.5) * 3);
      mod.connect(mg).connect(car.frequency);
      car.connect(g);
      break;
    }
    case "flute":
    case "whistle": {
      const fl = ev.inst === "flute";
      const g = envGain(v, dest, when, dur, vel * (fl ? 0.3 : 0.24), { a: fl ? 0.07 : 0.03, d: 0.2, s: 0.85, r: 0.12 });
      const o = osc(v, fl ? wave(v, "flute", [1, 0.25, 0.08, 0.03]) : "sine", f, when, end(0.15));
      vibrato(v, o.detune, when, end(0.15), fl ? 5 : 6, fl ? 14 : 20, 0.2);
      applyGlide(o.frequency);
      o.connect(g);
      const n = noiseSrc(v, when, end(0.15));
      const bp = filt(v, "bandpass", Math.min(9000, f * 2), 2);
      const ng = envGain(v, dest, when, dur, vel * (fl ? 0.06 : 0.02), { a: 0.04, d: 0.1, s: 0.6, r: 0.1 });
      n.connect(bp).connect(ng);
      break;
    }
    case "voice": {
      const vowels = [
        [800, 1150, 2900],
        [450, 800, 2830],
        [325, 700, 2530],
        [400, 1700, 2600],
      ];
      const vw = vowels[Math.floor(ev.t / 8) % vowels.length];
      const g = envGain(v, dest, when, dur, vel * 0.55, { a: 0.07, d: 0.2, s: 0.85, r: 0.18 });
      const mix = c.createGain();
      vw.forEach((fr, i) => {
        const bp = filt(v, "bandpass", fr, 7 + i * 2);
        const bg = c.createGain();
        bg.gain.value = [1.4, 0.8, 0.35][i];
        mix.connect(bp).connect(bg).connect(g);
      });
      const o = osc(v, "sawtooth", f, when, end(0.2));
      vibrato(v, o.detune, when, end(0.2), 5.2, 22, 0.25);
      applyGlide(o.frequency);
      o.connect(mix);
      const n = noiseSrc(v, when, end(0.2));
      const ng = c.createGain();
      ng.gain.value = 0.04;
      n.connect(ng).connect(mix);
      break;
    }
    case "harmonica": {
      const g = envGain(v, dest, when, dur, vel * 0.42, { a: 0.03, d: 0.2, s: 0.8, r: 0.08 });
      const bp = filt(v, "bandpass", 1300, 1.4);
      const lp = filt(v, "lowpass", 3500);
      bp.connect(lp).connect(g);
      const o = osc(v, "square", f, when, end(0.1));
      const o2 = osc(v, "sawtooth", f, when, end(0.1), 8);
      vibrato(v, o.detune, when, end(0.1), 5.5, 16, 0.2);
      applyGlide(o.frequency);
      applyGlide(o2.frequency);
      o.connect(bp);
      o2.connect(bp);
      break;
    }

    /* ---- textures ---- */
    case "vinyl":
    case "tape": {
      const n = noiseSrc(v, when, when + dur, v.crackle);
      const bp = filt(v, ev.inst === "tape" ? "highpass" : "bandpass", ev.inst === "tape" ? 5000 : 2500, 0.5);
      const g = envGain(v, out, when, dur - 0.5, vel * (ev.inst === "tape" ? 0.12 : 0.5), { a: 0.5, d: 0, s: 1, r: 0.5 });
      n.connect(bp).connect(g);
      break;
    }
    case "rain":
    case "wind": {
      const rain = ev.inst === "rain";
      const n = noiseSrc(v, when, when + dur + 1);
      const f1 = filt(v, rain ? "highpass" : "bandpass", rain ? 900 : 500, rain ? 0.5 : 1.2);
      const f2 = filt(v, "lowpass", rain ? 6000 : 1600);
      if (!rain) {
        const lfo = c.createOscillator();
        lfo.frequency.value = 0.09;
        const lg = c.createGain();
        lg.gain.value = 300;
        lfo.connect(lg).connect(f1.frequency);
        lfo.start(when);
        lfo.stop(when + dur + 1);
      }
      const g = envGain(v, pan(v, out, rain ? 0 : -0.2), when, dur - 1, vel * (rain ? 0.12 : 0.18), { a: 1.5, d: 0, s: 1, r: 1 });
      n.connect(f1).connect(f2).connect(g);
      if (rain) {
        const c2 = noiseSrc(v, when, when + dur + 1, v.crackle);
        const hp = filt(v, "highpass", 3000);
        const g2 = envGain(v, pan(v, out, 0.3), when, dur - 1, vel * 0.25, { a: 1.5, d: 0, s: 1, r: 1 });
        c2.connect(hp).connect(g2);
      }
      break;
    }
    case "riser": {
      const n = noiseSrc(v, when, when + dur + 0.1);
      const bp = filt(v, "bandpass", 300, 2, when);
      bp.frequency.exponentialRampToValueAtTime(7000, when + dur);
      const g = c.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vel * 0.35, when + dur * 0.97);
      g.gain.linearRampToValueAtTime(0, when + dur + 0.05);
      n.connect(bp).connect(g).connect(out);
      break;
    }
    case "impact": {
      const o = osc(v, "sine", 80, when, when + 2.5);
      o.frequency.exponentialRampToValueAtTime(32, when + 0.6);
      const g = envGain(v, out, when, 0.02, vel * 0.7, { a: 0.003, d: 1.6, s: 0, r: 0.5 });
      o.connect(g);
      const n = noiseSrc(v, when, when + 2.5);
      const lp = filt(v, "lowpass", 2500, 0.7, when);
      lp.frequency.exponentialRampToValueAtTime(200, when + 1.5);
      const ng = envGain(v, out, when, 0.02, vel * 0.35, { a: 0.002, d: 1.2, s: 0, r: 0.4 });
      n.connect(lp).connect(ng);
      break;
    }
    case "drone": {
      const g = envGain(v, out, when, dur, vel * 0.12, { a: Math.min(4, dur * 0.3), d: 0, s: 1, r: 3 });
      const lp = filt(v, "lowpass", 420, 1.5);
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.07;
      const lg = c.createGain();
      lg.gain.value = 180;
      lfo.connect(lg).connect(lp.frequency);
      lfo.start(when);
      lfo.stop(when + dur + 3.2);
      lp.connect(g);
      for (const [m, d] of [[0, -5], [7, 5], [12, 0]] as const) osc(v, "sawtooth", midiToFreq(ev.midi + m), when, when + dur + 3.2, d).connect(lp);
      break;
    }
  }
}

const DRUM_INSTS = new Set(["kick", "snare", "clap", "hatC", "hatO", "shaker", "ride", "crash", "tom", "rim", "perc"]);

export function playEvent(v: VoiceCtx, ev: NoteEvent, when: number, beatSec: number, out: AudioNode) {
  if (DRUM_INSTS.has(ev.inst)) drum(v, ev, when, out);
  else tonal(v, ev, when, beatSec, out);
}
