/**
 * Offline render suite: renders 12 songs through the real Web Audio graph (node-web-audio-api, 22.05 kHz),
 * checks clipping / NaN and that dropout + bridge are audibly sparser (section RMS).
 * Usage: npx tsx scripts/render-check.ts
 */
import { OfflineAudioContext } from "node-web-audio-api";
import { parsePrompt, resolvePlan, suggestDimensions } from "../src/lib/music/parse";
import { compose, type Song } from "../src/lib/music/compose";
import { renderSong, type OfflineCtor } from "../src/lib/music/render";
import { goWild } from "../src/lib/music/wild";
import { keyLabel } from "../src/lib/music/theory";
import { DEFAULT_DIMENSIONS } from "../src/lib/types";

type Run = { name: string; prompt: string; wildSeed?: number };
const RUNS: Run[] = [
  { name: "Go wild #1", prompt: "delta blues", wildSeed: 101 },
  { name: "Go wild #2", prompt: "delta blues", wildSeed: 202 },
  { name: "Go wild #3", prompt: "delta blues", wildSeed: 303 },
  { name: "Go wild #4 (avoid)", prompt: "delta blues, no supersaws, no 808s", wildSeed: 404 },
  { name: "Go wild (folk base)", prompt: "campfire banjo folk", wildSeed: 505 },
  { name: "7/8", prompt: "funky groove in 7/8 with clave" },
  { name: "Polyrhythm", prompt: "polyrhythm 3 over 4 afrobeat house" },
  { name: "Lydian drone", prompt: "lydian drone ambient with pedal tone" },
  { name: "Framework prompt", prompt: "dark psybient, no supersaws, no trap hats, mono sub, wide pads, opening with distant drone, hook is the bassline" },
  { name: "5/4 prog", prompt: "prog rock in 5/4 with hemiola" },
  { name: "Trap, no 808s", prompt: "aggressive trap, no 808s, no risers" },
  { name: "Slow delta blues", prompt: "slow delta blues with harmonica" },
];

const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -120);
let fails = 0;
const rows: string[] = [];
async function main() {
for (const r of RUNS) {
  const pr = parsePrompt(r.prompt);
  let plan = resolvePlan(pr);
  let label = "";
  if (r.wildSeed !== undefined) {
    const g = goWild(plan, {}, r.wildSeed);
    plan = resolvePlan(pr, g.edits);
    label = ` [${g.base} × ${g.edm}]`;
  }
  const dims = suggestDimensions(plan, pr, DEFAULT_DIMENSIONS);
  const song: Song = compose(plan, dims, r.wildSeed ? r.wildSeed % 7 : 0);
  const t0 = Date.now();
  const buf = await renderSong(song, dims, { sampleRate: 22050, Ctor: OfflineAudioContext as unknown as OfflineCtor });
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  let peak = 0, nan = 0, clip = 0;
  for (let i = 0; i < L.length; i++) {
    const a = Math.abs(L[i]), b = Math.abs(R[i]);
    if (Number.isNaN(a) || Number.isNaN(b)) nan++;
    const m = Math.max(a, b);
    if (m > peak) peak = m;
    if (m >= 0.999) clip++;
  }
  const spb = 60 / song.bpm;
  const rms = (b0: number, b1: number) => {
    const i0 = Math.floor(b0 * spb * buf.sampleRate), i1 = Math.min(L.length, Math.floor(b1 * spb * buf.sampleRate));
    let s = 0;
    for (let i = i0; i < i1; i++) s += L[i] * L[i] + R[i] * R[i];
    return Math.sqrt(s / Math.max(1, 2 * (i1 - i0)));
  };
  const secDb = song.sections.map((s) => ({ s, d: db(rms(s.startBeat, s.startBeat + s.beats)) }));
  const loud = secDb.filter((x) => x.s.type === "chorus" || x.s.type === "drop");
  const loudDb = loud.length ? Math.max(...loud.map((x) => x.d)) : Math.max(...secDb.map((x) => x.d));
  const sparse = secDb.filter((x) => ["dropout", "bridge", "breakdown"].includes(x.s.type));
  const sparseOk = sparse.every((x) => x.d < loudDb - 3);
  const ok = peak < 1 && nan === 0 && clip === 0 && sparseOk;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${r.name}${label}: "${r.prompt}"`);
  console.log(`     ${song.bpm} BPM · ${song.meterLabel} · ${keyLabel(song.keyRoot, song.mode)} · ${song.spec.production.ending} ending · ${buf.duration.toFixed(1)} s · peak ${peak.toFixed(3)} (${db(peak).toFixed(1)} dBFS) · NaN ${nan} · clipped ${clip} · render ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  console.log(`     section RMS dB: ${secDb.map((x) => `${x.s.label} ${x.d.toFixed(0)}`).join(" | ")}`);
  rows.push(`| ${r.name}${label} | ${song.meterLabel} | ${keyLabel(song.keyRoot, song.mode)} | ${peak.toFixed(2)} | ${sparse.map((x) => `${x.s.label} ${(x.d - loudDb).toFixed(0)} dB`).join(", ") || "—"} | ${ok ? "pass" : "FAIL"} |`);
}
console.log("\n| run | meter | key | peak | sparse sections vs loudest hook | result |\n|---|---|---|---|---|---|\n" + rows.join("\n"));
console.log(fails ? `\n${fails} FAILURES` : "\nALL PASS");
process.exit(fails ? 1 : 0);
}
main();
