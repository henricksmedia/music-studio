/** Human shaping dimensions — not plugins. */
export type Dimensions = {
  space: number; // 0–100 ambience / width
  bass: number; // 0–100 low-end weight
  drumFeel: number; // 0–100: soft & sparse → hard & busy
  grit: number; // 0–100 texture / edge
  pulse: number; // 0–100 calm → driving rhythmic energy
  vocalCharacter: number; // 0–100 airy lead → present, voice-like
  genrePull: number; // 0–100 organic/acoustic ← → electronic/cyborg
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
