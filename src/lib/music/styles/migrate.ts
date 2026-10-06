/**
 * Saved-song compatibility: maps old or renamed ids in stored PlanEdits to current ones and drops values that no
 * longer resolve (so an old song or a hand-edited project file loads instead of crashing). Valid edits come back
 * unchanged, which keeps every saved song composing exactly as before.
 */
import { BASS_LABELS, HARMONY_LABELS, KIT_LABELS, LEAD_LABELS } from "../genres";
import { MOOD_IDS, type PlanEdits } from "../parse";
import {
  AVOID_IDS,
  CHORD_COLORS,
  DELAYS,
  DEV_IDS,
  ENDINGS,
  FEELS,
  FORM_VARIANTS,
  HARMONY_TRICKS,
  HOOKS,
  METER_IDS,
  OPENINGS,
  PROGRESSION_IDS,
  REVERBS,
  TRICK_IDS,
  VOCALS,
  type StyleOverrides,
} from "../spec";
import { MODE_IDS } from "../theory";
import { rootStyleId, substyleId } from "./index";

const keysOf = (o: object) => new Set(Object.keys(o));
const ENUM_STYLE: Partial<Record<keyof StyleOverrides, Set<string>>> = {
  meter: new Set(METER_IDS),
  feel: keysOf(FEELS),
  chordColor: keysOf(CHORD_COLORS),
  progression: new Set<string>([...PROGRESSION_IDS, "genre"]),
  hook: keysOf(HOOKS),
  opening: keysOf(OPENINGS),
  ending: keysOf(ENDINGS),
  vocal: keysOf(VOCALS),
  reverb: keysOf(REVERBS),
  delay: keysOf(DELAYS),
  form: keysOf(FORM_VARIANTS),
};
const FLAG_STYLE: Partial<Record<keyof StyleOverrides, Set<string>>> = {
  tricks: new Set(TRICK_IDS),
  development: new Set(DEV_IDS),
  harmonyTricks: keysOf(HARMONY_TRICKS),
};
const INSTRUMENTS: Record<"kit" | "bass" | "harmony" | "lead", Set<string>> = {
  kit: keysOf(KIT_LABELS),
  bass: keysOf(BASS_LABELS),
  harmony: keysOf(HARMONY_LABELS),
  lead: keysOf(LEAD_LABELS),
};
const MOODS = new Set<string>(MOOD_IDS);
const MODES = new Set<string>(MODE_IDS);
const AVOIDS = new Set<string>(AVOID_IDS);

function migrateStyle(style: StyleOverrides): StyleOverrides {
  let out: Record<string, unknown> | null = null;
  const set = (k: string, v: unknown) => {
    out ??= { ...style };
    if (v === undefined) delete out[k];
    else out[k] = v;
  };
  if (style.edm !== undefined) {
    const id = substyleId(style.edm);
    if (id !== style.edm) set("edm", id ?? undefined);
  }
  for (const [k, allowed] of Object.entries(ENUM_STYLE) as [keyof StyleOverrides, Set<string>][]) {
    const v = style[k];
    if (v !== undefined && !allowed.has(v as string)) set(k, undefined);
  }
  for (const [k, allowed] of Object.entries(FLAG_STYLE) as [keyof StyleOverrides, Set<string>][]) {
    const v = style[k] as Record<string, unknown> | undefined;
    if (v === undefined) continue;
    if (!v || typeof v !== "object") set(k, undefined);
    else if (Object.keys(v).some((x) => !allowed.has(x))) set(k, Object.fromEntries(Object.entries(v).filter(([x]) => allowed.has(x))));
  }
  if (style.avoid !== undefined) {
    if (!Array.isArray(style.avoid)) set("avoid", undefined);
    else if (style.avoid.some((x) => !AVOIDS.has(x))) set("avoid", style.avoid.filter((x) => AVOIDS.has(x)));
  }
  return (out as StyleOverrides | null) ?? style;
}

export function migrateEdits(edits: PlanEdits): PlanEdits {
  if (!edits || typeof edits !== "object") return {};
  let out: PlanEdits | null = null;
  const copy = () => (out ??= { ...edits });

  if (edits.genres !== undefined) {
    const ok = Array.isArray(edits.genres)
      ? edits.genres.flatMap((g) => {
          const id = rootStyleId(g?.id);
          return id && Number.isFinite(g.weight) && g.weight > 0 ? [id === g.id ? g : { ...g, id }] : [];
        })
      : [];
    if (!Array.isArray(edits.genres) || ok.length !== edits.genres.length || ok.some((g, i) => g !== edits.genres![i])) {
      if (ok.length) copy().genres = ok;
      else delete copy().genres;
    }
  }
  if (edits.moods !== undefined) {
    const ok = Array.isArray(edits.moods) ? edits.moods.filter((m) => MOODS.has(m)) : [];
    if (!Array.isArray(edits.moods) || ok.length !== edits.moods.length) copy().moods = ok;
  }
  if (edits.mode !== undefined && !MODES.has(edits.mode)) delete copy().mode;
  if (edits.bpm !== undefined && !(Number.isFinite(edits.bpm) && edits.bpm > 0)) delete copy().bpm;
  if (edits.root !== undefined && !(Number.isInteger(edits.root) && edits.root >= 0 && edits.root < 12)) delete copy().root;
  if (edits.instruments !== undefined) {
    const inst = edits.instruments && typeof edits.instruments === "object" ? edits.instruments : {};
    const bad = (Object.keys(INSTRUMENTS) as (keyof typeof INSTRUMENTS)[]).filter((k) => inst[k] !== undefined && !INSTRUMENTS[k].has(inst[k] as string));
    if (bad.length || inst !== edits.instruments) {
      const fixed = { ...inst };
      for (const k of bad) delete fixed[k];
      copy().instruments = fixed;
    }
  }
  if (edits.style !== undefined) {
    const style = edits.style && typeof edits.style === "object" ? migrateStyle(edits.style) : {};
    if (style !== edits.style) copy().style = style;
  }
  return out ?? edits;
}
