import { parsePrompt, resolvePlan, suggestDimensions } from "../src/lib/music/parse";
import { compose } from "../src/lib/music/compose";
import { keyLabel } from "../src/lib/music/theory";
import { DEFAULT_DIMENSIONS } from "../src/lib/types";
const prompts = process.argv.slice(2).length ? process.argv.slice(2) : [
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
  "xqzzv blorp",
  "funky groove in 7/8 with clave",
  "polyrhythm 3 over 4 afrobeat-ish house",
  "lydian drone ambient with pedal tone",
  "delta blues go wild",
  "dark psybient, no supersaws, no trap hats, mono sub, wide pads, opening with distant drone, hook is the bassline",
];
for (const p of prompts) {
  const pr = parsePrompt(p);
  const plan = resolvePlan(pr);
  const dims = suggestDimensions(plan, pr, DEFAULT_DIMENSIONS);
  const s = compose(plan, dims, 0);
  const a = s.arrangement;
  const sp = s.spec;
  console.log(`\n"${p}"${plan.fallback ? " [fallback]" : ""}`);
  console.log(`  genres: ${plan.genres.map((g) => `${g.id} ${(g.weight * 100) | 0}%`).join(", ")} | heard: ${plan.heard.join(", ")}`);
  console.log(`  ${plan.bpm} bpm, ${keyLabel(plan.root, plan.mode)}, ${s.durationSec.toFixed(0)}s, ${s.meterLabel}, ${s.progressionLabel}, form ${a.form}/${sp.production.form}, ending ${sp.production.ending}: ${s.sections.map((x) => `${x.label}(${x.bars})`).join(" ")}`);
  console.log(`  kit ${a.kit} bass ${a.bassTimbre}/${a.bassStyle} chords ${a.harmonyInst}/${a.harmonyRhythm} lead ${a.leadInst}->${a.responseInst} hook ${sp.production.hook}/${a.hookInst} open ${sp.production.opening} tex ${a.textures.join(",")}`);
  console.log(`  tricks ${sp.rhythm.tricks.join(",")} | harm ${JSON.stringify({ c: sp.harmony.chordColor, p: sp.harmony.progression, pd: sp.harmony.pedal, dr: sp.harmony.drone })} | avoid ${sp.production.avoid.join(",")} | gear ${sp.production.gear.join(", ")}`);
  console.log(`  chords: ${s.barChords.slice(0, 12).join(" ")} … events ${s.events.length}, autos ${s.automation.length}`);
}
