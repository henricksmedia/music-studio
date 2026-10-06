import { parsePrompt, resolvePlan, suggestDimensions } from "../src/lib/music/parse";
import { compose } from "../src/lib/music/compose";
import { MODES } from "../src/lib/music/theory";
import { DEFAULT_DIMENSIONS } from "../src/lib/types";
const pr = parsePrompt("dorian funk vamp"); const plan = resolvePlan(pr); const s = compose(plan, suggestDimensions(plan, pr, DEFAULT_DIMENSIONS), 0);
const sc = new Set(MODES[s.mode].steps); const pc = (m: number) => ((m - s.keyRoot) % 12 + 12) % 12;
console.log(s.spec.harmony, s.arrangement?.leadInst);
for (const e of s.events.filter(e => e.stem === "lead" && e.midi > 0 && !sc.has(pc(e.midi)))) console.log(e.t.toFixed(2), e.inst, "pc", pc(e.midi), "glide", e.glide, "dur", e.dur.toFixed(2), s.events.filter(h => h.stem === "harmony" && h.t <= e.t + .01 && h.t + h.dur > e.t).map(h => pc(h.midi)).join(","));
