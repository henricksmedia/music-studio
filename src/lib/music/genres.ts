/** Genre profiles: each is a recipe the composer blends from. All sounds are synthesized locally.
 *  The profile data lives in the style registry (styles/); GENRES is its engine-1 view. */
import type { ModeId } from "./theory";
import { genreProfiles } from "./styles";

export type GenreId =
  | "house"
  | "techno"
  | "synthwave"
  | "ambient"
  | "trance"
  | "dnb"
  | "folk"
  | "countryRock"
  | "rock"
  | "blues"
  | "lofi"
  | "boombap"
  | "trap"
  | "cinematic"
  | "jazz";

export type DrumKit = "acoustic" | "electronic" | "808" | "brush" | "lofi" | "cinematic" | "gated";
export type BassTimbre = "sub" | "saw" | "square" | "reese" | "808" | "upright" | "pluck" | "fm" | "acid";
export type BassStyle =
  | "root8"
  | "rootFifth"
  | "offbeat"
  | "rolling"
  | "walking"
  | "slide808"
  | "sustain"
  | "syncopated"
  | "pulse16"
  | "riff"
  | "sparse";
export type HarmonyInst =
  | "pad"
  | "supersaw"
  | "piano"
  | "epiano"
  | "organ"
  | "strumGuitar"
  | "cleanGuitar"
  | "distGuitar"
  | "pluckArp"
  | "strings"
  | "brass"
  | "choir";
export type HarmonyRhythm = "sustain" | "stabs" | "strum" | "arp" | "pulse8" | "comp" | "power" | "swells" | "pick";
export type LeadInst =
  | "sawLead"
  | "squareLead"
  | "acidLead"
  | "pluck"
  | "banjo"
  | "guitar"
  | "distGuitar"
  | "bell"
  | "flute"
  | "whistle"
  | "voice"
  | "piano"
  | "epiano"
  | "strings"
  | "brass"
  | "harmonica"
  | "fmLead";
export type MelodyStyle = "straight" | "syncopated" | "sparse" | "arp" | "long" | "bluesy" | "riff";
export type TextureId = "vinyl" | "rain" | "wind" | "riser" | "impact" | "shimmer" | "drone" | "tape";
export type Form = "edm" | "song" | "ambient" | "cinematic" | "blues";

/** Drum pattern: 16 steps per bar. X=accent x=normal g=ghost r=roll (ratchet) .=rest */
export type DrumPattern = {
  kick?: string;
  snare?: string;
  clap?: string;
  hat?: string;
  open?: string;
  ride?: string;
  shaker?: string;
  rim?: string;
  perc?: string;
  tom?: string;
};

export type GenreProfile = {
  id: GenreId;
  label: string;
  family: "electronic" | "organic" | "hybrid";
  tempo: [number, number];
  swing: number; // 0..1
  swingGrid: 8 | 16;
  halfTime?: boolean;
  form: Form;
  modes: [ModeId, number][];
  progressions: { major: string[][]; minor: string[][] };
  barsPerChord: number;
  drums: { kit: DrumKit; patterns: DrumPattern[]; level: number };
  bass: { timbres: [BassTimbre, number][]; styles: [BassStyle, number][]; octave: number };
  harmony: { insts: [HarmonyInst, number][]; rhythms: Partial<Record<HarmonyInst, HarmonyRhythm>>; extend: boolean; strum?: string };
  lead: { insts: [LeadInst, number][]; style: MelodyStyle; density: number; scale: "mode" | "pentatonic" | "blues" };
  textures: TextureId[];
  dims: { space: number; grit: number; drumFeel: number; pulse: number; bass: number; genrePull: number };
  energy: number;
  rootPrefs?: number[]; // pitch classes favored (guitar-friendly keys)
};

export const GENRES: Record<GenreId, GenreProfile> = genreProfiles();

export const GENRE_IDS = Object.keys(GENRES) as GenreId[];

export const LEAD_LABELS: Record<LeadInst, string> = {
  sawLead: "saw lead",
  squareLead: "square lead",
  acidLead: "acid lead",
  pluck: "synth pluck",
  banjo: "banjo",
  guitar: "guitar",
  distGuitar: "dirty guitar",
  bell: "bells",
  flute: "flute",
  whistle: "whistle",
  voice: "synth voice",
  piano: "piano",
  epiano: "electric piano",
  strings: "strings",
  brass: "brass",
  harmonica: "harmonica",
  fmLead: "FM lead",
};
export const HARMONY_LABELS: Record<HarmonyInst, string> = {
  pad: "warm pad",
  supersaw: "supersaw",
  piano: "piano",
  epiano: "electric piano",
  organ: "organ",
  strumGuitar: "strummed guitar",
  cleanGuitar: "picked guitar",
  distGuitar: "distorted guitar",
  pluckArp: "arp pluck",
  strings: "strings",
  brass: "brass",
  choir: "choir",
};
export const BASS_LABELS: Record<BassTimbre, string> = {
  sub: "sub bass",
  saw: "saw bass",
  square: "square bass",
  reese: "reese bass",
  "808": "808",
  upright: "upright bass",
  pluck: "bass guitar",
  fm: "FM bass",
  acid: "acid bass",
};
export const KIT_LABELS: Record<DrumKit, string> = {
  acoustic: "live kit",
  electronic: "electronic kit",
  "808": "808 kit",
  brush: "brushes",
  lofi: "dusty kit",
  cinematic: "taiko / toms",
  gated: "80s gated kit",
};
