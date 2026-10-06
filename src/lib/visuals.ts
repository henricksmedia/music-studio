/**
 * Live visuals: one requestAnimationFrame loop draws every registered canvas.
 * Views that are offscreen, hidden or in a background tab don't draw. When playback stops the
 * loop runs a short tail (so meters fall back) and then sleeps until something changes.
 */
"use client";

export type VisualMode = "full" | "lite" | "off";

const MODE_KEY = "music-studio:visuals";

/** Weak phones (few cores, little memory or data saver) start in the lighter mode. */
function detectMode(): VisualMode {
  if (typeof navigator === "undefined") return "full";
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const cores = nav.hardwareConcurrency ?? 8;
  const mem = nav.deviceMemory ?? 8;
  return cores <= 4 || mem <= 3 || nav.connection?.saveData ? "lite" : "full";
}

let mode: VisualMode = "full";
let modeLoaded = false;
const modeListeners = new Set<() => void>();

export function getMode(): VisualMode {
  if (!modeLoaded && typeof window !== "undefined") {
    modeLoaded = true;
    const saved = localStorage.getItem(MODE_KEY);
    mode = saved === "full" || saved === "lite" || saved === "off" ? saved : detectMode();
  }
  return mode;
}
export const getServerMode = (): VisualMode => "full";
export function setMode(m: VisualMode) {
  mode = m;
  modeLoaded = true;
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    /* private mode */
  }
  modeListeners.forEach((f) => f());
  wake();
}
export function subscribeMode(f: () => void) {
  modeListeners.add(f);
  return () => modeListeners.delete(f);
}

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------- scheduler ---------------- */

export type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number, frame: FrameInfo) => void;
export type FrameInfo = { now: number; dt: number; live: boolean; lite: boolean; id: number };

type View = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; draw: DrawFn; onscreen: boolean; w: number; h: number; dirty: boolean };

const views = new Set<View>();
let raf = 0;
let lastDraw = 0;
let frameId = 0;
let live = false;
let tailUntil = 0;
const cost = { avg: 0, max: 0, frames: 0 };

/** Rolling draw cost in ms (exposed for perf checks). */
export const visualCost = () => ({ avgMs: +cost.avg.toFixed(3), maxMs: +cost.max.toFixed(3), frames: cost.frames });
if (typeof window !== "undefined") (window as unknown as { __visualCost: typeof visualCost }).__visualCost = visualCost;

function fpsCap() {
  if (reducedMotion()) return 10;
  return getMode() === "lite" ? 30 : 60;
}

function wake() {
  if (raf || typeof window === "undefined" || document.hidden) return;
  raf = requestAnimationFrame(loop);
}

function loop(now: number) {
  raf = 0;
  if (document.hidden || getMode() === "off") {
    // still paint one idle frame so canvases aren't stale
    for (const v of views) if (v.dirty && v.onscreen) paint(v, now, 0);
    return;
  }
  const animating = live || now < tailUntil;
  const anyDirty = [...views].some((v) => v.dirty && v.onscreen);
  if (!animating && !anyDirty) return;
  const minGap = 1000 / fpsCap() - 2;
  if (animating && now - lastDraw < minGap) {
    raf = requestAnimationFrame(loop);
    return;
  }
  const dt = lastDraw ? Math.min(100, now - lastDraw) : 16;
  lastDraw = now;
  frameId++;
  const t0 = performance.now();
  for (const v of views) if (v.onscreen && (animating || v.dirty)) paint(v, now, dt);
  const spent = performance.now() - t0;
  cost.frames++;
  cost.avg = cost.avg ? cost.avg * 0.95 + spent * 0.05 : spent;
  cost.max = Math.max(cost.max * 0.999, spent);
  if (animating) raf = requestAnimationFrame(loop);
}

function paint(v: View, now: number, dt: number) {
  v.dirty = false;
  if (!v.w || !v.h) return;
  v.ctx.setTransform(v.canvas.width / v.w, 0, 0, v.canvas.height / v.h, 0, 0);
  v.draw(v.ctx, v.w, v.h, { now, dt, live, lite: getMode() !== "full", id: frameId });
}

/** Tell the loop whether audio is playing (animate) or not (draw a short tail, then sleep). */
export function setLive(on: boolean) {
  if (live === on) return;
  live = on;
  if (!on) tailUntil = performance.now() + 1500;
  wake();
}

if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => (document.hidden ? undefined : wake()));

/** Register a canvas; returns an unregister function and a way to request a redraw. */
export function registerView(canvas: HTMLCanvasElement, draw: DrawFn) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dispose: () => {}, invalidate: () => {} };
  const v: View = { canvas, ctx, draw, onscreen: true, w: 0, h: 0, dirty: true };
  const size = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, getMode() === "full" ? 2 : 1);
    v.w = r.width;
    v.h = r.height;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    v.dirty = true;
    wake();
  };
  const ro = new ResizeObserver(size);
  ro.observe(canvas);
  const io = new IntersectionObserver((es) => {
    v.onscreen = es[es.length - 1].isIntersecting;
    if (v.onscreen) {
      v.dirty = true;
      wake();
    }
  });
  io.observe(canvas);
  const unsubMode = subscribeMode(size);
  views.add(v);
  size();
  return {
    dispose: () => {
      ro.disconnect();
      io.disconnect();
      unsubMode();
      views.delete(v);
    },
    invalidate: () => {
      v.dirty = true;
      wake();
    },
  };
}

/* ---------------- shared analyser reads (one read per analyser per frame) ---------------- */

type Cache = { frame: number; time?: Float32Array<ArrayBuffer>; freq?: Float32Array<ArrayBuffer>; tf: number; ff: number };
const cache = new WeakMap<AnalyserNode, Cache>();

function entry(a: AnalyserNode) {
  let c = cache.get(a);
  if (!c) cache.set(a, (c = { frame: -1, tf: -1, ff: -1 }));
  return c;
}
export function timeData(a: AnalyserNode): Float32Array<ArrayBuffer> {
  const c = entry(a);
  if (!c.time || c.time.length !== a.fftSize) c.time = new Float32Array(a.fftSize);
  if (c.tf !== frameId) {
    a.getFloatTimeDomainData(c.time);
    c.tf = frameId;
  }
  return c.time;
}
export function freqData(a: AnalyserNode): Float32Array<ArrayBuffer> {
  const c = entry(a);
  if (!c.freq || c.freq.length !== a.frequencyBinCount) c.freq = new Float32Array(a.frequencyBinCount);
  if (c.ff !== frameId) {
    a.getFloatFrequencyData(c.freq);
    c.ff = frameId;
  }
  return c.freq;
}

/* ---------------- levels ---------------- */

export const toDb = (x: number) => (x > 1e-6 ? 20 * Math.log10(x) : -120);

export function levels(data: Float32Array, stride = 1) {
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += stride) {
    const v = data[i];
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
    sum += v * v;
    n++;
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, n)) };
}

/** Ballistics for one meter: fast attack, smooth fall, peak hold and clip hold. */
export class MeterState {
  peakDb = -120;
  rmsDb = -120;
  holdDb = -120;
  holdUntil = 0;
  clipUntil = 0;
  update(peak: number, rms: number, now: number, dt: number) {
    const fall = (dt / 1000) * 24; // dB per second
    const p = toDb(peak);
    const r = toDb(rms);
    this.peakDb = p > this.peakDb ? p : Math.max(p, this.peakDb - fall);
    this.rmsDb = r > this.rmsDb ? this.rmsDb + (r - this.rmsDb) * 0.5 : Math.max(r, this.rmsDb - fall);
    if (p >= this.holdDb || now > this.holdUntil) {
      this.holdDb = p;
      this.holdUntil = now + 1500;
    }
    if (peak >= 0.97) this.clipUntil = now + 2000;
  }
  decay(now: number, dt: number) {
    this.update(0, 0, now, dt);
  }
}

/** Map dBFS to 0..1 on a meter scale (−48 dB … 0 dB). */
export const meterPos = (db: number) => Math.max(0, Math.min(1, (db + 48) / 48));

/* ---------------- drawing helpers ---------------- */

export const COLORS = {
  grid: "rgba(255,255,255,0.06)",
  axis: "rgba(255,255,255,0.35)",
  wave: "rgba(236,238,255,0.92)",
  accent: "rgba(129,140,248,0.9)",
  pink: "rgba(244,114,182,0.9)",
};

/** Oscilloscope with a rising-zero-crossing trigger so periodic waves stand still. */
export function drawScope(ctx: CanvasRenderingContext2D, w: number, h: number, data: Float32Array, opts: { color?: string; lineWidth?: number; gain?: number } = {}) {
  const span = Math.min(data.length >> 1, 2048);
  let start = 0;
  for (let i = 1; i < data.length - span; i++) {
    if (data[i - 1] < 0 && data[i] >= 0) {
      start = i;
      break;
    }
  }
  const mid = h / 2;
  const g = (opts.gain ?? 1) * (h / 2) * 0.9;
  const step = Math.max(1, Math.floor(span / w));
  ctx.lineWidth = opts.lineWidth ?? 1.5;
  ctx.strokeStyle = opts.color ?? COLORS.wave;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let x = 0, i = start; x <= w && i < data.length; x += (w / span) * step, i += step) {
    const y = mid - Math.max(-1, Math.min(1, data[i])) * g;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

const F_MIN = 20;
const F_MAX = 20000;
export const xOfFreq = (f: number, w: number) => (Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * w;
const freqOfX = (x: number, w: number) => F_MIN * Math.pow(F_MAX / F_MIN, x / w);

/** Per-column bin ranges for a log axis, each averaging about 1/12 octave (wider would flatten sparse synth partials into plateaus). */
export function binColumns(cols: number, bins: number, sampleRate: number) {
  const hzPerBin = sampleRate / 2 / bins;
  const half = Math.pow(2, 1 / 24);
  const out: [number, number][] = [];
  for (let c = 0; c < cols; c++) {
    const f = freqOfX(c + 0.5, cols);
    const lo = Math.max(1, Math.floor(f / half / hzPerBin));
    const hi = Math.min(bins - 1, Math.max(lo, Math.ceil((f * half) / hzPerBin)));
    out.push([lo, hi]);
  }
  return out;
}

export const DB_FLOOR = -96;
export const DB_CEIL = -12;
/** Average power across a column's bins, in dB. */
export function columnDb(freq: Float32Array, lo: number, hi: number) {
  let p = 0;
  for (let b = lo; b <= hi; b++) p += Math.pow(10, freq[b] / 10);
  return 10 * Math.log10(p / (hi - lo + 1) + 1e-12);
}

/** Spectrogram colour map (dark → indigo → pink → warm white). */
export function heat(v: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, v));
  if (t < 0.35) {
    const k = t / 0.35;
    return [10 + 60 * k, 10 + 40 * k, 30 + 150 * k];
  }
  if (t < 0.7) {
    const k = (t - 0.35) / 0.35;
    return [70 + 170 * k, 50 + 30 * k, 180 - 20 * k];
  }
  const k = (t - 0.7) / 0.3;
  return [240 + 15 * k, 80 + 160 * k, 160 + 80 * k];
}
