/** Go wild: fuse the current base style with a random EDM substyle and randomize the rest within coherent bounds. */
import type { GenreId } from "./genres";
import type { ModeId } from "./theory";
import type { Plan, PlanEdits } from "./parse";
import { EDM, EDM_IDS, type EdmId, type StyleOverrides } from "./spec";
import { makeRng } from "./rng";

const MAP_KEYS = new Set(["tricks", "development", "harmonyTricks"]);

/** Merge two edit layers. In `b.style`, a key set to undefined clears it (used by "unlock"). */
export function mergeEdits(a: PlanEdits, b: PlanEdits): PlanEdits {
  const out: PlanEdits = { ...a };
  for (const k of ["genres", "moods", "bpm", "root", "mode"] as const) if (k in b) (out as Record<string, unknown>)[k] = b[k];
  if ("instruments" in b) out.instruments = b.instruments;
  if (b.style) {
    const st: Record<string, unknown> = { ...(a.style ?? {}) };
    for (const [k, v] of Object.entries(b.style)) {
      if (v === undefined) delete st[k];
      else if (MAP_KEYS.has(k)) st[k] = { ...((st[k] as object) ?? {}), ...(v as object) };
      else st[k] = v;
    }
    out.style = st as StyleOverrides;
  }
  for (const k of Object.keys(out) as (keyof PlanEdits)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** Remove locked keys (style keys and/or plan fields) from an edit layer. */
export function unlockEdits(e: PlanEdits, styleKeys: (keyof StyleOverrides)[] = [], planKeys: ("bpm" | "root" | "mode" | "instruments")[] = []): PlanEdits {
  const out: PlanEdits = { ...e };
  for (const k of planKeys) delete out[k];
  if (out.style) {
    const st = { ...out.style };
    for (const k of styleKeys) delete st[k];
    out.style = st;
  }
  return out;
}

const FAMILY_MODES: ModeId[] = ["aeolian", "dorian", "phrygian", "mixolydian", "lydian", "ionian", "harmonicMinor", "locrian"];

export type WildResult = { edits: PlanEdits; edm: EdmId; base: GenreId };

/**
 * Build Go wild edits. `plan` is the current plan (its primary genre is the base, default delta blues);
 * `locks` are user-pinned choices that survive the reroll; avoid rules from the prompt and locks are always kept.
 */
export function goWild(plan: Plan | null, locks: PlanEdits, seed: number): WildResult {
  const rng = makeRng(seed);
  const base: GenreId = plan && !plan.fallback ? plan.genres[0].id : "blues";
  const lockedEdm = locks.style?.edm;
  const pool = EDM_IDS.filter((id) => EDM[id].genre !== base);
  const edm: EdmId = lockedEdm ?? rng.pick(pool.length ? pool : EDM_IDS);
  const prof = EDM[edm];
  const genres: { id: GenreId; weight: number }[] = [{ id: base, weight: rng.range(0.55, 0.62) }];
  if (prof.genre !== base) genres.push({ id: prof.genre, weight: rng.range(0.3, 0.4) });
  if (rng.chance(0.2) && base !== "cinematic" && prof.genre !== "cinematic") genres.push({ id: "cinematic", weight: 0.15 });
  const [lo, hi] = prof.bpm;
  const modes = prof.modes && rng.chance(0.6) ? prof.modes : FAMILY_MODES;
  const avoid = Array.from(new Set([...(plan?.style.avoid ?? []), ...(locks.style?.avoid ?? [])]));
  const wildEdits: PlanEdits = {
    genres,
    bpm: Math.round(lo + rng() * (hi - lo)),
    root: rng.int(0, 11),
    mode: rng.pick(modes),
    style: { wild: true, edm, ...(avoid.length ? { avoid } : {}) },
  };
  // locks win over the random layer
  return { edits: mergeEdits(wildEdits, locks), edm, base };
}
