/**
 * Style registry types (docs/genre-expansion-plan.md, sections 7.1–7.2).
 * Phase 0 carries the engine-1 data unchanged: a root style holds the GenreProfile the composer reads,
 * a substyle holds the EdmProfile overlay it has always had. Later phases grow StyleRecipe toward the full recipe.
 */
import type { GenreId, GenreProfile } from "../genres";
import type { EdmId, EdmProfile } from "../spec";

export type FamilyId =
  | "house"
  | "techno"
  | "trance"
  | "psytrance"
  | "dnb"
  | "bass"
  | "breaks"
  | "hardDance"
  | "synthRetro"
  | "downtempo"
  | "ambient"
  | "hipHop"
  | "pop"
  | "soulFunk"
  | "rock"
  | "punkMetal"
  | "blues"
  | "jazz"
  | "countryFolk"
  | "latin"
  | "caribbean"
  | "african"
  | "world"
  | "cinematic";

export type Family = { id: FamilyId; label: string; electronic: boolean };

export type StyleId = GenreId | EdmId;

type StyleBase = {
  id: StyleId;
  label: string;
  family: FamilyId;
  tempo: [number, number];
  /** Composer engine the data belongs to (1 = the original 15 genres + EDM substyles). */
  engine: 1;
};

/** A root style: a full recipe the composer can build a song from on its own. */
export type GenreStyle = StyleBase & {
  kind: "genre";
  id: GenreId;
  profile: GenreProfile;
  /** Names the Identity card may show when the prompt names them (e.g. "Deep House" for "deep house"). */
  namedVariants: string[];
};

/** A substyle: an overlay on a root style (tempo, feel, tricks, timbres, FX), used by prompts, the Genre card and Go wild. */
export type Substyle = StyleBase & {
  kind: "substyle";
  id: EdmId;
  base: GenreId;
  overlay: EdmProfile;
};

export type StyleRecipe = GenreStyle | Substyle;
