/**
 * Style registry (docs/genre-expansion-plan.md, section 7). Every style the app can build a song from lives here;
 * GENRES, EDM and SUBSTYLES in genres.ts / spec.ts are derived views kept for existing callers.
 * Phase 0 holds the engine-1 data unchanged (styles/legacy.ts).
 */
import type { GenreId, GenreProfile } from "../genres";
import type { EdmId, EdmProfile } from "../spec";
import { LEGACY_EDM, LEGACY_GENRES, LEGACY_VARIANT_NAMES } from "./legacy";
import type { Family, FamilyId, GenreStyle, StyleId, StyleRecipe, Substyle } from "./types";

export type { Family, FamilyId, GenreStyle, StyleId, StyleRecipe, Substyle } from "./types";

/** Composer engine new songs are made with. Bumped by the first phase that changes how songs sound. */
export const ENGINE_VERSION = 1;

/** Tempo bounds: the parser clamps prompts to min–max; the breakdown's BPM nudges may go up to nudgeMax. */
export const TEMPO_LIMITS = { min: 55, max: 180, nudgeMax: 185 } as const;

export const FAMILIES: Record<FamilyId, Family> = {
  house: { id: "house", label: "House", electronic: true },
  techno: { id: "techno", label: "Techno", electronic: true },
  trance: { id: "trance", label: "Trance", electronic: true },
  psytrance: { id: "psytrance", label: "Psytrance", electronic: true },
  dnb: { id: "dnb", label: "Drum & Bass", electronic: true },
  bass: { id: "bass", label: "Dubstep & UK Bass", electronic: true },
  breaks: { id: "breaks", label: "Breaks & Electro", electronic: true },
  hardDance: { id: "hardDance", label: "Hard Dance", electronic: true },
  synthRetro: { id: "synthRetro", label: "Synth, Retro & Dark", electronic: true },
  downtempo: { id: "downtempo", label: "Downtempo, Chill & Lo-fi", electronic: true },
  ambient: { id: "ambient", label: "Ambient & Experimental", electronic: true },
  hipHop: { id: "hipHop", label: "Hip Hop", electronic: false },
  pop: { id: "pop", label: "Pop", electronic: false },
  soulFunk: { id: "soulFunk", label: "R&B, Soul & Funk", electronic: false },
  rock: { id: "rock", label: "Rock", electronic: false },
  punkMetal: { id: "punkMetal", label: "Punk & Metal", electronic: false },
  blues: { id: "blues", label: "Blues", electronic: false },
  jazz: { id: "jazz", label: "Jazz", electronic: false },
  countryFolk: { id: "countryFolk", label: "Country & Folk", electronic: false },
  latin: { id: "latin", label: "Latin", electronic: false },
  caribbean: { id: "caribbean", label: "Caribbean", electronic: false },
  african: { id: "african", label: "African", electronic: false },
  world: { id: "world", label: "World", electronic: false },
  cinematic: { id: "cinematic", label: "Cinematic & Classical", electronic: false },
};

const ROOT_FAMILY: Record<GenreId, FamilyId> = {
  house: "house",
  techno: "techno",
  synthwave: "synthRetro",
  ambient: "ambient",
  trance: "trance",
  dnb: "dnb",
  folk: "countryFolk",
  countryRock: "countryFolk",
  rock: "rock",
  blues: "blues",
  lofi: "downtempo",
  boombap: "hipHop",
  trap: "hipHop",
  cinematic: "cinematic",
  jazz: "jazz",
};

const SUBSTYLE_FAMILY: Record<EdmId, FamilyId> = {
  futureGarage: "bass",
  melodicTechno: "techno",
  psytrance: "psytrance",
  liquidDnb: "dnb",
  deepHouse: "house",
  acidHouse: "house",
  breakbeat: "breaks",
  darksynth: "synthRetro",
  halftime: "dnb",
  ukg: "bass",
  psybient: "psytrance",
  futureBass: "bass",
  electro: "breaks",
  cyberTrance: "trance",
  dubTechno: "techno",
  tripHop: "downtempo",
  glitchHop: "breaks",
};

/** Root styles in their original order (prompt fallbacks and Go wild index into this order, so it must not change). */
const ROOTS: GenreStyle[] = (Object.keys(LEGACY_GENRES) as GenreId[]).map((id) => {
  const profile = LEGACY_GENRES[id];
  return { kind: "genre", id, label: profile.label, family: ROOT_FAMILY[id], tempo: profile.tempo, engine: 1, profile, namedVariants: LEGACY_VARIANT_NAMES[id] };
});

/** Substyles in their original order (same reason). */
const SUBS: Substyle[] = (Object.keys(LEGACY_EDM) as EdmId[]).map((id) => {
  const overlay = LEGACY_EDM[id];
  return { kind: "substyle", id, label: overlay.label, family: SUBSTYLE_FAMILY[id], tempo: overlay.bpm, engine: 1, base: overlay.genre, overlay };
});

const ROOT_BY_ID = new Map<string, GenreStyle>(ROOTS.map((s) => [s.id, s]));
const SUB_BY_ID = new Map<string, Substyle>(SUBS.map((s) => [s.id, s]));

export const STYLES: readonly StyleRecipe[] = [...ROOTS, ...SUBS];
export const ROOT_STYLE_IDS: readonly GenreId[] = ROOTS.map((s) => s.id);
export const SUBSTYLE_IDS: readonly EdmId[] = SUBS.map((s) => s.id);

/**
 * Old or renamed ids -> current ids. Every id a saved song or project file may contain must resolve.
 * Phase 0 keeps every engine-1 id unchanged; later phases add entries here instead of breaking old files.
 */
const ALIASES: Record<string, StyleId> = {};

export function rootStyleId(id: unknown): GenreId | null {
  if (typeof id !== "string") return null;
  const to = ALIASES[id] ?? id;
  return ROOT_BY_ID.has(to) ? (to as GenreId) : null;
}

export function substyleId(id: unknown): EdmId | null {
  if (typeof id !== "string") return null;
  const to = ALIASES[id] ?? id;
  return SUB_BY_ID.has(to) ? (to as EdmId) : null;
}

export function rootStyle(id: GenreId): GenreStyle {
  const s = ROOT_BY_ID.get(id);
  if (!s) throw new Error(`unknown style ${id}`);
  return s;
}

export function substyle(id: EdmId): Substyle {
  const s = SUB_BY_ID.get(id);
  if (!s) throw new Error(`unknown substyle ${id}`);
  return s;
}

/** Engine-1 views in their original shapes and key order. */
export const genreProfiles = (): Record<GenreId, GenreProfile> => Object.fromEntries(ROOTS.map((s) => [s.id, s.profile])) as Record<GenreId, GenreProfile>;
export const edmProfiles = (): Record<EdmId, EdmProfile> => Object.fromEntries(SUBS.map((s) => [s.id, s.overlay])) as Record<EdmId, EdmProfile>;
export const variantNames = (): Record<GenreId, string[]> => Object.fromEntries(ROOTS.map((s) => [s.id, s.namedVariants])) as Record<GenreId, string[]>;
