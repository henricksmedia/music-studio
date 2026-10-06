import { parsePrompt, resolvePlan, suggestDimensions } from "../src/lib/music/parse";
import { compose } from "../src/lib/music/compose";
import { goWild } from "../src/lib/music/wild";
import { DEFAULT_DIMENSIONS } from "../src/lib/types";
const prompts = ["ambient space drift", "lydian drone ambient with pedal tone", "slow sad piano ballad 60 bpm", "dark techno warehouse at 3am", "epic cinematic orchestral battle", "funky groove in 7/8 with clave", "lo-fi hip hop study beats with rain", "campfire banjo folk"];
let short = 0, n = 0;
const show = (name: string, s: ReturnType<typeof compose>) => { n++; const secs = s.sections.length; if (secs < 9 && !s.sections.some(x => x.type === "solo")) short++; const dur = s.barStarts[s.barStarts.length - 1] * 60 / s.bpm; console.log(`${name.padEnd(40)} ${s.bpm} ${s.spec.production.form.padEnd(9)} ${dur.toFixed(0)}s ${secs}: ${s.sections.map(x => `${x.label}(${x.bars})`).join(" ")}`); };
for (const p of prompts) for (let v = 0; v < 2; v++) { const pr = parsePrompt(p); const plan = resolvePlan(pr); show(p, compose(plan, suggestDimensions(plan, pr, DEFAULT_DIMENSIONS), v)); }
const pr = parsePrompt("delta blues");
for (let i = 0; i < 8; i++) { const g = goWild(resolvePlan(pr), {}, 101 * (i + 1)); const plan = resolvePlan(pr, g.edits); show("wild " + g.edm, compose(plan, suggestDimensions(plan, pr, DEFAULT_DIMENSIONS), i + 1)); }
console.log(`${short}/${n} songs with fewer than 9 sections`);
