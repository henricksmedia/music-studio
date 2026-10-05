/** Human shaping dimensions — not plugins. */
export type Dimensions = {
  space: number; // 0–100 ambience / width
  bass: number; // 0–100 low-end weight
  drumFeel: number; // 0–100: soft → hard / sparse → busy
  grit: number; // 0–100 texture / edge
  pulse: number; // 0–100 energy / tempo pull
  vocalCharacter: number; // 0–100 airy → present (tone color for lead)
  genrePull: number; // 0–100 folk/organic ← → electronic/cyborg
};

export const DEFAULT_DIMENSIONS: Dimensions = {
  space: 40,
  bass: 55,
  drumFeel: 50,
  grit: 25,
  pulse: 55,
  vocalCharacter: 45,
  genrePull: 50,
};

export type PieceState = {
  intent: string;
  dimensions: Dimensions;
  seed: number;
  generated: boolean;
};

export type StemId = "pulse" | "bass" | "texture" | "lead";

export const STEM_LABELS: Record<StemId, string> = {
  pulse: "Pulse / drums",
  bass: "Bass",
  texture: "Texture / hats",
  lead: "Lead / character",
};
