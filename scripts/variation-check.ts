import { parsePrompt, resolvePlan, suggestDimensions } from "../src/lib/music/parse";
import { compose } from "../src/lib/music/compose";
import { NOTE_NAMES, keyLabel } from "../src/lib/music/theory";
import { DEFAULT_DIMENSIONS } from "../src/lib/types";
for (const p of ["campfire banjo folk", "dark techno warehouse at 3am"]) {
  const pr = parsePrompt(p); const plan = resolvePlan(pr); const dims = suggestDimensions(plan, pr, DEFAULT_DIMENSIONS);
  console.log(`\n"${p}" — ${plan.bpm} bpm ${keyLabel(plan.root, plan.mode)} (fixed across variations)`);
  for (let v = 0; v < 3; v++) {
    const s = compose(plan, dims, v);
    const lead = s.events.filter((e) => e.stem === "lead").slice(0, 10).map((e) => NOTE_NAMES[e.midi % 12]).join(" ");
    const a = s.arrangement;
    console.log(`  v${v}: chords ${[...new Set(s.barChords)].join(" ")} | lead ${a.leadInst}: ${lead} | kit ${a.kit}, bass ${a.bassTimbre}/${a.bassStyle}, chords ${a.harmonyInst} | ${s.sections.map((x) => x.label[0]).join("")} ${s.durationSec.toFixed(0)}s`);
  }
}
