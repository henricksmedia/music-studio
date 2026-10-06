/**
 * Offline audio test: renders prompts through the real engine (node-web-audio-api) and measures them.
 * Usage: npx tsx scripts/audio-test.ts [--wav] ["prompt" ...]
 */
import fs from "fs";
import { OfflineAudioContext } from "node-web-audio-api";
import { parsePrompt, resolvePlan, suggestDimensions } from "../src/lib/music/parse";
import { compose } from "../src/lib/music/compose";
import { renderSong, type OfflineCtor } from "../src/lib/music/render";
import { encodeWav } from "../src/lib/music/files";
import { keyLabel, NOTE_NAMES } from "../src/lib/music/theory";
import { DEFAULT_DIMENSIONS } from "../src/lib/types";

const args = process.argv.slice(2);
const writeWav = args.includes("--wav");
const custom = args.filter((a) => !a.startsWith("--"));
const PROMPTS = custom.length
  ? custom
  : [
      "lonely country rock with a trance pulse",
      "dark techno warehouse at 3am",
      "dreamy 80s synthwave night drive",
      "campfire banjo folk",
      "lo-fi hip hop study beats with rain",
      "epic cinematic orchestral battle",
      "slow delta blues with harmonica",
      "happy summer house party",
      "aggressive trap with 808s",
      "ambient space drift",
      "purple elephant spaceship",
    ];

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ar = re[i + k + len / 2], ai = im[i + k + len / 2];
        const xr = ar * wr - ai * wi, xi = ar * wi + ai * wr;
        re[i + k + len / 2] = re[i + k] - xr;
        im[i + k + len / 2] = im[i + k] - xi;
        re[i + k] += xr;
        im[i + k] += xi;
      }
    }
  }
}

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
function corr(a: number[], b: number[]) {
  const ma = a.reduce((s, x) => s + x, 0) / 12, mb = b.reduce((s, x) => s + x, 0) / 12;
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) {
    n += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return n / Math.sqrt(da * db || 1);
}

function analyze(mono: Float32Array, sr: number, bpmHint: number) {
  const N = 4096, hop = 2048;
  let peak = 0, sumSq = 0, clips = 0, nan = 0;
  for (const x of mono) {
    if (Number.isNaN(x)) nan++;
    const a = Math.abs(x);
    if (a > peak) peak = a;
    if (a >= 0.999) clips++;
    sumSq += x * x;
  }
  const rms = Math.sqrt(sumSq / mono.length);
  const chroma = new Array(12).fill(0);
  let centSum = 0, centW = 0, low = 0, high = 0, total = 0;
  const flux: number[] = [];
  let prevMag: Float64Array | null = null;
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  for (let s = 0; s + N < mono.length; s += hop) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = mono[s + i] * win[i];
    fft(re, im);
    const mag = new Float64Array(N / 2);
    let e = 0, c = 0, fl = 0;
    for (let k = 1; k < N / 2; k++) {
      const m = Math.hypot(re[k], im[k]);
      mag[k] = m;
      const f = (k * sr) / N;
      e += m * m;
      c += f * m * m;
      if (f < 150) low += m * m;
      if (f > 4000) high += m * m;
      total += m * m;
      if (f > 130 && f < 1800) {
        const midi = 69 + 12 * Math.log2(f / 440);
        chroma[((Math.round(midi) % 12) + 12) % 12] += m;
      }
      if (prevMag) fl += Math.max(0, m - prevMag[k]);
    }
    if (e > 1e-9) { centSum += c; centW += e; }
    flux.push(fl);
    prevMag = mag;
  }
  // tempo from onset-flux autocorrelation (60–180 bpm), resolved toward the closest multiple of the hint
  const fr = sr / hop;
  const mean = flux.reduce((a, b) => a + b, 0) / flux.length;
  const f0 = flux.map((x) => Math.max(0, x - mean));
  let best = 0, bestLag = 0;
  const scores: [number, number][] = [];
  for (let bpm = 55; bpm <= 185; bpm += 0.5) {
    const lag = (60 / bpm) * fr;
    let acc = 0;
    for (let i = 0; i + lag + 1 < f0.length; i++) {
      const j = i + lag, j0 = Math.floor(j), t = j - j0;
      acc += f0[i] * (f0[j0] * (1 - t) + f0[j0 + 1] * t);
    }
    scores.push([bpm, acc]);
    if (acc > best) { best = acc; bestLag = bpm; }
  }
  let tempo = bestLag;
  for (const m of [0.5, 2, 1.5, 2 / 3]) {
    const cand = tempo * m;
    if (Math.abs(cand - bpmHint) < Math.abs(tempo - bpmHint) && cand >= 55 && cand <= 185) {
      const sc = scores.reduce((b, s) => (Math.abs(s[0] - cand) < Math.abs(b[0] - cand) ? s : b), scores[0])[1];
      if (sc > best * 0.6) tempo = cand;
    }
  }
  let bestKey = { r: 0, minor: false, c: -2 };
  for (let r = 0; r < 12; r++) {
    const rot = chroma.slice(r).concat(chroma.slice(0, r));
    const cM = corr(rot, MAJOR), cm = corr(rot, MINOR);
    if (cM > bestKey.c) bestKey = { r, minor: false, c: cM };
    if (cm > bestKey.c) bestKey = { r, minor: true, c: cm };
  }
  return {
    peak, rmsDb: 20 * Math.log10(rms + 1e-12), clips, nan,
    centroid: centW ? centSum / centW : 0,
    lowPct: (100 * low) / total, highPct: (100 * high) / total,
    tempo, key: `${NOTE_NAMES[bestKey.r]} ${bestKey.minor ? "min" : "maj"}`, keyRoot: bestKey.r, keyMinor: bestKey.minor,
    chroma: chroma.map((x) => x / Math.max(...chroma)),
  };
}

function sectionRms(mono: Float32Array, sr: number, song: ReturnType<typeof compose>) {
  const beatSec = 60 / song.bpm;
  return song.sections.map((s) => {
    const a = Math.floor((0.05 + s.startBeat * beatSec) * sr), b = Math.floor((0.05 + (s.startBeat + s.beats) * beatSec) * sr);
    let sum = 0;
    for (let i = a; i < b && i < mono.length; i++) sum += mono[i] * mono[i];
    return `${s.label.replace(/ /g, "")}:${(20 * Math.log10(Math.sqrt(sum / Math.max(1, b - a)) + 1e-9)).toFixed(0)}`;
  });
}

(async () => {
  const rows: { p: string; feat: number[]; a: ReturnType<typeof analyze> }[] = [];
  fs.mkdirSync("/tmp/ms-renders", { recursive: true });
  for (const p of PROMPTS) {
    const pr = parsePrompt(p);
    const plan = resolvePlan(pr);
    const dims = suggestDimensions(plan, pr, DEFAULT_DIMENSIONS);
    const song = compose(plan, dims, 0);
    const t0 = Date.now();
    const buf = await renderSong(song, dims, { Ctor: OfflineAudioContext as unknown as OfflineCtor });
    const ms = Date.now() - t0;
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    const mono = new Float32Array(L.length);
    for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) / 2;
    const a = analyze(mono, buf.sampleRate, song.bpm);
    const secs = sectionRms(mono, buf.sampleRate, song);
    const ar = song.arrangement;
    console.log(`\n"${p}"  (render ${ms}ms, ${song.durationSec.toFixed(0)}s)`);
    console.log(`  plan:     ${song.bpm} bpm, ${keyLabel(song.keyRoot, song.mode)} | ${plan.genres.map((g) => g.id).join("+")} | ${ar.kit}, ${ar.bassTimbre}/${ar.bassStyle}, ${ar.harmonyInst}/${ar.harmonyRhythm}, lead ${ar.leadInst}`);
    console.log(`  measured: tempo≈${a.tempo.toFixed(1)} key≈${a.key} | peak ${a.peak.toFixed(3)} clips ${a.clips} nan ${a.nan} | rms ${a.rmsDb.toFixed(1)} dB | centroid ${a.centroid.toFixed(0)} Hz | low ${a.lowPct.toFixed(0)}% high ${a.highPct.toFixed(1)}%`);
    console.log(`  sections: ${secs.join(" ")}`);
    rows.push({ p, a, feat: [song.bpm / 180, a.centroid / 3000, a.lowPct / 100, a.highPct / 20, (a.rmsDb + 30) / 30, ...a.chroma.map((x) => x * 0.5)] });
    if (writeWav) fs.writeFileSync(`/tmp/ms-renders/${p.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.wav`, encodeWav(buf));
  }
  // pairwise distances
  let minD = 99, minPair = "";
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const d = Math.sqrt(rows[i].feat.reduce((s, x, k) => s + (x - rows[j].feat[k]) ** 2, 0));
      if (d < minD) { minD = d; minPair = `${rows[i].p} <> ${rows[j].p}`; }
    }
  console.log(`\nclosest pair (feature distance ${minD.toFixed(3)}): ${minPair}`);
})();
