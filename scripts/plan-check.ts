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
];
for (const p of prompts) {
  const pr = parsePrompt(p);
  const plan = resolvePlan(pr);
  const dims = suggestDimensions(plan, pr, DEFAULT_DIMENSIONS);
  const s = compose(plan, dims, 0);
  const a = s.arrangement;
  console.log(`\n"${p}"${plan.fallback ? " [fallback]" : ""}`);
  console.log(`  genres: ${plan.genres.map((g) => `${g.id} ${(g.weight * 100) | 0}%`).join(", ")} | moods: ${plan.moods.join(",") || "-"} | roles: ${JSON.stringify(plan.roles)}`);
  console.log(`  ${plan.bpm} bpm, ${keyLabel(plan.root, plan.mode)}, ${s.durationSec.toFixed(0)}s, form ${a.form}: ${s.sections.map((x) => `${x.label}(${x.bars})`).join(" ")}`);
  console.log(`  kit ${a.kit}<${a.drumsFrom}> bass ${a.bassTimbre}/${a.bassStyle}<${a.bassFrom}> chords ${a.harmonyInst}/${a.harmonyRhythm}<${a.harmonyFrom}> lead ${a.leadInst}/${a.melodyStyle}<${a.leadFrom}> tex ${a.textures.join(",")}`);
  console.log(`  chords: ${s.barChords.slice(0, 8).join(" ")} … events ${s.events.length} | dims ${JSON.stringify(dims)} | heard: ${plan.heard.join(", ")}`);
}
