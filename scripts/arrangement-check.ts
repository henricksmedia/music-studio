/**
 * Event-level checks for the arrangement engine (no audio): meters, modes, avoid rules,
 * Verse A vs B difference, dropout/bridge sparsity, hook recurrence, endings, prompt format.
 * Usage: npx tsx scripts/arrangement-check.ts
 */
import { parsePrompt, resolvePlan, suggestDimensions, type PlanEdits } from "../src/lib/music/parse";
import { compose, type Song, type Section } from "../src/lib/music/compose";
import { goWild } from "../src/lib/music/wild";
import { MODES } from "../src/lib/music/theory";
import { stylePrompt, timelinePrompt, identityCard, breakdownCard } from "../src/lib/music/describe";
import { DEFAULT_DIMENSIONS } from "../src/lib/types";

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "  PASS" : "  FAIL"}  ${msg}`);
  if (!cond) fails++;
};
const make = (prompt: string, variation = 0, edits: PlanEdits = {}) => {
  const pr = parsePrompt(prompt);
  const plan = resolvePlan(pr, edits);
  const dims = suggestDimensions(plan, pr, DEFAULT_DIMENSIONS);
  return { song: compose(plan, dims, variation), plan };
};
const inSec = (song: Song, s: Section) => song.events.filter((e) => e.t >= s.startBeat && e.t < s.startBeat + s.beats);
const density = (song: Song, s: Section) => inSec(song, s).filter((e) => e.stem !== "texture").length / Math.max(1, s.beats);

/* 1. meters: bar lengths and a clear downbeat */
console.log("\n1. Meters and downbeats");
for (const [p, steps] of [["funky groove in 7/8 with clave", 14], ["waltz folk in 3/4", 12], ["prog rock in 5/4", 20], ["celtic jig in 6/8", 12], ["house in 4/4", 16]] as const) {
  const { song } = make(p);
  const allSteps = song.barSteps.every((n) => n === steps);
  let kickBars = 0, downbeats = 0;
  for (const s of song.sections.filter((x) => ["verse", "chorus", "drop"].includes(x.type))) {
    for (let b = s.startBar; b < s.startBar + s.bars; b++) {
      const t0 = song.barStarts[b];
      const kicks = song.events.filter((e) => e.inst === "kick" && e.t >= t0 - 0.05 && e.t < song.barStarts[b + 1] - 0.05);
      if (!kicks.length) continue;
      kickBars++;
      if (kicks.some((e) => Math.abs(e.t - t0) < 0.06)) downbeats++;
    }
  }
  ok(allSteps && downbeats / Math.max(1, kickBars) > 0.85, `${p}: ${song.meterLabel}, bars of ${steps} steps=${allSteps}, kick on beat 1 in ${downbeats}/${kickBars} bars`);
}
{
  const a = make("house in 4/4").song, b = make("house in 7/8").song;
  const onsets = (s: Song) => new Set(s.events.filter((e) => e.inst === "kick").map((e) => Math.round(((e.t - s.barStarts[Math.max(0, s.barStarts.findIndex((x) => x > e.t) - 1)]) % 4) * 4)));
  ok([...onsets(b)].join() !== [...onsets(a)].join(), `kick onset grid differs 4/4 vs 7/8: {${[...onsets(a)].sort((x, y) => x - y)}} vs {${[...onsets(b)].sort((x, y) => x - y)}}`);
}
{
  const { song } = make("polyrhythm 3 over 4 afrobeat house");
  const perc = song.events.filter((e) => e.inst === "perc" && e.midi > 0);
  ok(perc.length > 20 && song.spec.rhythm.tricks.includes("polyrhythm"), `polyrhythm prompt: ${perc.length} pitched 3-against-4 hits (ratio ${song.spec.rhythm.polyRatio.join(":")})`);
}

/* 2. modes */
console.log("\n2. Mode pitch classes");
for (const [p, mode] of [["lydian drone ambient with pedal tone", "lydian"], ["dorian funk vamp", "dorian"], ["phrygian dark techno", "phrygian"], ["locrian horror ambient", "locrian"], ["mixolydian rock", "mixolydian"]] as const) {
  const { song } = make(p);
  const scale = new Set(MODES[song.mode].steps);
  const mel = song.events.filter((e) => e.stem === "lead" && e.midi > 0);
  const pcOf = (m: number) => (((m - song.keyRoot) % 12) + 12) % 12;
  const harm = song.events.filter((e) => e.stem === "harmony" && e.midi > 0);
  // a note respects the mode if it is in the scale, is a blues bend into a scale tone, or is a tone of the
  // chord sounding under it (covers deliberate modal-interchange chords)
  const inScale = mel.filter((e) => {
    const pc = pcOf(e.midi);
    if (scale.has(pc)) return true;
    const g = (e as { glide?: number }).glide;
    if (g && scale.has(pcOf(e.midi + g))) return true;
    return harm.some((h) => h.t <= e.t + 0.01 && h.t + h.dur > e.t && pcOf(h.midi) === pc);
  }).length;
  const sig = { lydian: 6, dorian: 9, phrygian: 1, locrian: 6, mixolydian: 10 }[mode];
  const sigHits = mel.filter((e) => (((e.midi - song.keyRoot) % 12) + 12) % 12 === sig).length;
  ok(song.mode === mode && inScale / mel.length > (song.spec.harmony.chromatic ? 0.85 : 0.95) && sigHits > 0, `${p}: mode ${song.mode}, ${inScale}/${mel.length} lead notes in scale, signature note used ${sigHits}×`);
}

/* 3. avoid rules */
console.log("\n3. Avoid rules really exclude sounds");
const BANNED: Record<string, (s: Song) => number> = {
  supersaws: (s) => s.events.filter((e) => e.inst === "supersaw").length,
  "808s": (s) => s.events.filter((e) => e.inst === "808" || e.kit === "808").length,
  choirPads: (s) => s.events.filter((e) => e.inst === "choir" || e.inst === "voice").length,
  cheesyPiano: (s) => s.events.filter((e) => e.inst === "piano").length,
  genericRisers: (s) => s.events.filter((e) => e.inst === "riser").length,
  cinematicBooms: (s) => s.events.filter((e) => e.inst === "impact" || (e.kit === "cinematic" && e.inst === "tom")).length,
  orchestralSwells: (s) => s.events.filter((e) => e.inst === "strings" || e.inst === "brass").length,
  trapHats: (s) => {
    const h = s.events.filter((e) => e.inst === "hatC").map((e) => e.t).sort((a, b) => a - b);
    // a trap roll = 3+ consecutive hats closer than a 32nd note (ratchets/triplet-32nds)
    let rolls = 0, run = 0;
    for (let i = 1; i < h.length; i++) {
      const d = h[i] - h[i - 1];
      if (d < 0.03) continue; // simultaneous double trigger, not a roll
      run = d < 0.124 ? run + 1 : 0;
      if (run === 2) rolls++;
    }
    return rolls;
  },
  festivalBuilds: (s) => s.sections.filter((x) => x.type === "build").reduce((n, x) => n + inSec(s, x).filter((e) => e.inst === "snare").length, 0) > 0 && s.sections.some((x) => x.type === "build") ? s.sections.filter((x) => x.type === "build").reduce((n, x) => n + Math.max(0, inSec(s, x).filter((e) => e.inst === "snare").length - x.bars * 3), 0) : 0,
  drums: (s) => s.events.filter((e) => e.stem === "drums").length,
};
const baseline: Record<string, string> = {
  supersaws: "uplifting trance anthem",
  "808s": "aggressive trap with 808s",
  choirPads: "epic cinematic choir",
  cheesyPiano: "lo-fi hip hop piano",
  genericRisers: "big room edm festival",
  cinematicBooms: "epic cinematic orchestral battle",
  orchestralSwells: "epic cinematic orchestral battle",
  trapHats: "aggressive trap",
  festivalBuilds: "uplifting trance festival",
  drums: "dark techno warehouse",
};
const WORD: Record<string, string> = { supersaws: "no supersaws", "808s": "no 808s", choirPads: "no choir", cheesyPiano: "no piano", genericRisers: "no risers", cinematicBooms: "no booms", orchestralSwells: "no orchestral swells", trapHats: "no trap hats", festivalBuilds: "no festival builds", drums: "no drums" };
for (const id of Object.keys(BANNED)) {
  let before = 0, after = 0;
  for (let v = 0; v < 4; v++) {
    before += BANNED[id](make(baseline[id], v).song);
    after += BANNED[id](make(`${baseline[id]}, ${WORD[id]}`, v).song);
  }
  ok(after === 0, `${WORD[id]} on "${baseline[id]}" (4 takes): offending events ${before} → ${after}`);
}
{
  // Go wild must respect avoid rules
  const pr = parsePrompt("delta blues, no supersaws, no 808s, no trap hats, no risers");
  let bad = 0;
  for (let i = 0; i < 12; i++) {
    const g = goWild(resolvePlan(pr), {}, 1000 + i * 77);
    const plan = resolvePlan(pr, g.edits);
    const s = compose(plan, suggestDimensions(plan, pr, DEFAULT_DIMENSIONS), i + 1);
    bad += BANNED.supersaws(s) + BANNED["808s"](s) + BANNED.trapHats(s) + BANNED.genericRisers(s);
  }
  ok(bad === 0, `Go wild ×12 with "no supersaws, no 808s, no trap hats, no risers": offending events ${bad}`);
}

/* 4. Verse A vs Verse B, 5. sparsity, 6. hook recurrence */
console.log("\n4–6. Verse B vs A, sparser dropout/bridge, recurring hook");
const prompts = ["lonely country rock with a trance pulse", "dark techno warehouse at 3am", "dreamy 80s synthwave night drive", "happy summer house party", "funky groove in 7/8 with clave", "aggressive trap with 808s", "lo-fi hip hop study beats with rain"];
const pr0 = parsePrompt("delta blues");
for (let i = 0; i < 3; i++) prompts.push(`__wild${i}`);
for (const p of prompts) {
  let song: Song;
  if (p.startsWith("__wild")) {
    const i = Number(p.slice(6));
    const g = goWild(resolvePlan(pr0), {}, 4242 + i * 999);
    const plan = resolvePlan(pr0, g.edits);
    song = compose(plan, suggestDimensions(plan, pr0, DEFAULT_DIMENSIONS), i + 1);
  } else song = make(p).song;
  const name = p.startsWith("__wild") ? `Go wild (delta blues × ${song.spec.production.edm})` : p;
  const A = song.sections.find((s) => s.type === "verse" && s.part === "A");
  const B = song.sections.find((s) => (s.type === "verse" || s.type === "solo") && (s.part === "B" || s.final));
  if (A && B) {
    const stepsOf = (s: Section, inst: string) => new Set(inSec(song, s).filter((e) => e.inst === inst || e.stem === inst).map((e) => { const b = song.barStarts.findIndex((x) => x > e.t + 1e-6) - 1; return Math.round((e.t - song.barStarts[b]) * 4); }));
    const kickDiff = [...stepsOf(B, "kick")].sort().join() !== [...stepsOf(A, "kick")].sort().join();
    const bassDiff = [...stepsOf(B, "bass")].sort().join() !== [...stepsOf(A, "bass")].sort().join();
    const percA = inSec(song, A).filter((e) => e.stem === "drums").length / A.beats, percB = inSec(song, B).filter((e) => e.stem === "drums").length / B.beats;
    const leadA = inSec(song, A).filter((e) => e.stem === "lead"), leadB = inSec(song, B).filter((e) => e.stem === "lead");
    const mean = (xs: { midi: number }[]) => xs.reduce((a, e) => a + e.midi, 0) / Math.max(1, xs.length);
    const regDiff = Math.abs(mean(leadA) - mean(leadB)) >= 5;
    const instDiff = new Set(leadB.map((e) => e.inst)).size > 0 && [...new Set(leadB.map((e) => e.inst))].join() !== [...new Set(leadA.map((e) => e.inst))].join();
    const wA = song.automation.find((x) => x.beat >= A.startBeat - 0.01)?.width ?? 0, wB = song.automation.find((x) => x.beat >= B.startBeat - 0.01)?.width ?? 0;
    const diffs = [kickDiff, bassDiff, percB > percA * 1.1, regDiff, instDiff, wB > wA + 0.05];
    const n = diffs.filter(Boolean).length;
    ok(n >= 4, `${name}: Verse B differs from A on ${n}/6 [kick ${kickDiff ? "✓" : "·"} bass ${bassDiff ? "✓" : "·"} perc ${percA.toFixed(1)}→${percB.toFixed(1)}/beat register ${mean(leadA).toFixed(0)}→${mean(leadB).toFixed(0)} inst ${instDiff ? "✓" : "·"} width ${wA.toFixed(2)}→${wB.toFixed(2)}]`);
  }
  const full = song.sections.filter((s) => s.type === "chorus" || s.type === "drop" || s.type === "verse");
  const fullD = full.reduce((a, s) => a + density(song, s), 0) / Math.max(1, full.length);
  for (const s of song.sections.filter((x) => ["dropout", "bridge", "breakdown"].includes(x.type))) {
    const kicks = inSec(song, s).filter((e) => e.inst === "kick" && e.t > s.startBeat + 0.1 && e.t < s.startBeat + s.beats - 0.1).length;
    ok(density(song, s) < fullD * 0.6 && kicks === 0, `${name}: ${s.label} density ${density(song, s).toFixed(1)} vs ${fullD.toFixed(1)} ev/beat in full sections, kicks ${kicks}`);
  }
  const hooks = song.sections.filter((s) => s.type === "chorus" || s.type === "drop");
  if (hooks.length >= 2 && song.spec.production.hook !== "bassline" && song.spec.production.hook !== "rhythm") {
    const sig = (s: Section, stem: string) => inSec(song, s).filter((e) => e.stem === stem && e.t < s.startBeat + song.barSteps[s.startBar] * 0.5).map((e) => `${Math.round((e.t - s.startBeat) * 4)}:${(((e.midi - song.keyRoot) % 12) + 12) % 12}`);
    const stem = ["chords", "stab"].includes(song.spec.production.hook) ? "harmony" : "lead";
    const a = new Set(sig(hooks[0], stem)), b = sig(hooks[hooks.length - 1], stem);
    const overlap = b.filter((x) => a.has(x)).length / Math.max(1, Math.min(a.size, b.length));
    ok(overlap >= 0.5, `${name}: hook motif (${song.spec.production.hook}) recurs in final hook, overlap ${(overlap * 100).toFixed(0)}%`);
  }
}

/* 7. endings + 8. prompt format */
console.log("\n7. Endings");
const seen = new Set<string>();
for (const e of ["ritard", "final hit", "fade out", "hard cut"]) {
  const { song } = make(`synthwave night drive, ${e === "ritard" ? "slow down at the end" : e === "final hit" ? "big ending" : e === "fade out" ? "fade out" : "hard cut ending"}`);
  seen.add(song.spec.production.ending);
  const n = song.barStarts.length;
  const lastGap = song.barStarts[n - 1] - song.barStarts[n - 2], firstGap = song.barStarts[1] - song.barStarts[0];
  console.log(`   "${e}" → ${song.spec.production.ending}; last bar ${lastGap.toFixed(2)} vs first ${firstGap.toFixed(2)} beats; tail ${song.tonicTail.toFixed(1)}`);
  if (song.spec.production.ending === "ritard") ok(lastGap > firstGap * 1.2, "ritard stretches the last bars");
}
ok(seen.size === 4, `all 4 endings reachable: ${[...seen].join(", ")}`);

console.log("\n8. Copy-as-prompt format");
{
  const { song, plan } = make("dark psybient, no supersaws, no trap hats, mono sub, wide pads, opening with distant drone, hook is the bassline");
  const tl = timelinePrompt(song, plan), sp = stylePrompt(song, plan);
  const lines = tl.split("\n");
  ok(/^\[Global \| instrumental \| \d+ BPM/.test(lines[0]) && lines[0].includes("mono sub"), `Global bracket: ${lines[0]}`);
  ok(lines.filter((l) => l.startsWith("[")).length === song.sections.length + 1, `${song.sections.length} section brackets`);
  ok(!/\b(energy|emotional|epic|beautiful|vibe|soaring|magical)\b/i.test(tl), "timeline uses production terms only (no emotional words)");
  const order = ["Genre:", "Mood:", "Core sound palette:", "Groove:", "Opening:", "Development:", "Hook:", "Mix geometry:", "Vocal status:", "Avoid:"];
  ok(order.every((k, i) => sp.split("\n")[i].startsWith(k)) && sp.includes("supersaws") && sp.includes("trap hats"), "style prompt in framework order incl. Avoid");
  console.log("\n--- example identity card ---");
  for (const c of identityCard(song, plan)) console.log(`${c.title}: ${c.value}`);
  console.log("\n--- example two-part prompt ---\nSTYLE PROMPT\n" + sp + "\n\nLYRICS / TIMELINE PROMPT\n" + tl);
  const g = goWild(resolvePlan(pr0), {}, 777);
  const wp = resolvePlan(pr0, g.edits);
  const ws = compose(wp, suggestDimensions(wp, pr0, DEFAULT_DIMENSIONS), 1);
  console.log("\n--- example Go wild breakdown (delta blues base) ---");
  for (const c of breakdownCard(ws, wp)) console.log(`${c.title}: ${c.value}`);
  console.log("\n--- its two-part prompt ---\nSTYLE PROMPT\n" + stylePrompt(ws, wp) + "\n\nLYRICS / TIMELINE PROMPT\n" + timelinePrompt(ws, wp));
}

console.log(`\n${fails ? `${fails} FAILURES` : "ALL PASS"}`);
process.exit(fails ? 1 : 0);
