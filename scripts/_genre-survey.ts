import { parsePrompt, resolvePlan, suggestDimensions } from "../src/lib/music/parse";
import { compose } from "../src/lib/music/compose";
import { GENRES, KIT_LABELS, BASS_LABELS, HARMONY_LABELS, LEAD_LABELS } from "../src/lib/music/genres";
import { keyLabel } from "../src/lib/music/theory";
import { DEFAULT_DIMENSIONS } from "../src/lib/types";

const PROMPTS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["techno", "dark techno warehouse at 3am", "house", "deep house", "trance", "drum and bass", "dubstep", "trap", "drill", "phonk", "boom bap", "lo-fi hip hop", "jazz", "bossa nova", "blues", "folk", "bluegrass", "country", "rock", "punk", "metal", "pop", "funk", "disco", "reggae", "afrobeat", "r&b", "soul", "gospel", "synthwave", "ambient", "cinematic", "hardstyle", "k-pop", "latin salsa"];

for (const p of PROMPTS) {
  const pr = parsePrompt(p);
  const plan = resolvePlan(pr);
  const dims = suggestDimensions(plan, pr, DEFAULT_DIMENSIONS);
  const rows: string[] = [];
  for (const v of [0, 1]) {
    const s = compose(plan, dims, v);
    const a = s.arrangement;
    const P = s.spec.production;
    const insts = new Set(s.events.map((e) => e.inst));
    rows.push(
      `   v${v}: "${P.substyle}" ${s.bpm}bpm ${s.meterLabel} ${s.spec.rhythm.feel}${s.spec.rhythm.swing ? " " + s.spec.rhythm.swing.toFixed(2) : ""} ${keyLabel(s.keyRoot, s.mode)} | ${KIT_LABELS[a.kit]} · ${BASS_LABELS[a.bassTimbre]} ${a.bassStyle} · ${HARMONY_LABELS[a.harmonyInst]} ${a.harmonyRhythm} · ${LEAD_LABELS[a.leadInst]} | ${s.durationSec.toFixed(0)}s\n` +
        `       sections: ${s.sections.map((x) => x.label).join(" > ")}\n` +
        `       fx: pump=${P.fx.pump} risers=${insts.has("riser")} impacts=${insts.has("impact")} dev=[${P.development.join(",")}] tricks=[${s.spec.rhythm.tricks.join(",")}]`
    );
  }
  console.log(`\n"${p}" -> ${plan.genres.map((g) => `${GENRES[g.id].label} ${Math.round(g.weight * 100)}%`).join(" + ")}${plan.fallback ? " [FALLBACK: no words recognized]" : ""}`);
  console.log(rows.join("\n"));
}
