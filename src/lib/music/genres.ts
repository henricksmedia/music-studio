/** Genre profiles: each is a recipe the composer blends from. All sounds are synthesized locally. */
import type { ModeId } from "./theory";

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

const GUITAR_KEYS = [4, 9, 2, 7, 0]; // E A D G C

export const GENRES: Record<GenreId, GenreProfile> = {
  house: {
    id: "house",
    label: "House",
    family: "electronic",
    tempo: [120, 126],
    swing: 0.15,
    swingGrid: 16,
    form: "edm",
    modes: [["aeolian", 3], ["dorian", 3], ["ionian", 2], ["mixolydian", 1]],
    progressions: {
      minor: [["i7", "iv7", "bVII", "bVImaj7"], ["i9", "bVII", "bVImaj7", "v7"], ["i7", "i7", "iv9", "iv9"]],
      major: [["Imaj7", "vi7", "ii7", "V"], ["IVmaj7", "V", "iii7", "vi7"], ["Imaj7", "IVmaj7", "Imaj7", "IVmaj7"]],
    },
    barsPerChord: 1,
    drums: {
      kit: "electronic",
      level: 0.95,
      patterns: [
        { kick: "x...x...x...x...", clap: "....x.......x...", hat: "g.g.g.g.g.g.g.g.", open: "..x...x...x...x.", shaker: "...g.....g....g." },
        { kick: "x...x...x...x...", clap: "....x.......x..g", hat: "gggggggggggggggg", open: "..x...x...x...x." },
      ],
    },
    bass: { timbres: [["saw", 2], ["fm", 2], ["sub", 1]], styles: [["offbeat", 2], ["syncopated", 3]], octave: 2 },
    harmony: { insts: [["epiano", 2], ["organ", 2], ["piano", 2], ["pad", 1]], rhythms: { epiano: "stabs", organ: "stabs", piano: "stabs", pad: "sustain" }, extend: true },
    lead: { insts: [["pluck", 3], ["bell", 2], ["voice", 2]], style: "syncopated", density: 0.5, scale: "mode" },
    textures: ["riser", "impact"],
    dims: { space: 40, grit: 15, drumFeel: 60, pulse: 65, bass: 60, genrePull: 80 },
    energy: 0.7,
  },
  techno: {
    id: "techno",
    label: "Techno",
    family: "electronic",
    tempo: [126, 138],
    swing: 0.05,
    swingGrid: 16,
    form: "edm",
    modes: [["phrygian", 3], ["aeolian", 3], ["dorian", 1]],
    progressions: {
      minor: [["i", "i", "bVII", "i"], ["i", "bII", "i", "i"], ["i7", "i7", "iv7", "iv7"]],
      major: [["I", "I", "bVII", "I"], ["I", "bVII", "I", "bVII"]],
    },
    barsPerChord: 2,
    drums: {
      kit: "electronic",
      level: 1,
      patterns: [
        { kick: "X...x...X...x...", clap: "....x.......x...", hat: "gggggggggggggggg", open: "..x...x...x...x.", rim: "......g..g....g." },
        { kick: "X...x...X...x...", hat: "g.gxg.gxg.gxg.gx", open: "..x...x...x...x.", perc: "x..g..x..g..x..." },
      ],
    },
    bass: { timbres: [["acid", 2], ["reese", 2], ["sub", 1]], styles: [["rolling", 3], ["offbeat", 2]], octave: 2 },
    harmony: { insts: [["pad", 2], ["pluckArp", 2], ["supersaw", 1]], rhythms: { pad: "swells", pluckArp: "arp", supersaw: "stabs" }, extend: false },
    lead: { insts: [["acidLead", 3], ["fmLead", 2], ["squareLead", 1]], style: "riff", density: 0.55, scale: "mode" },
    textures: ["riser", "impact", "drone"],
    dims: { space: 45, grit: 45, drumFeel: 75, pulse: 75, bass: 65, genrePull: 95 },
    energy: 0.8,
  },
  synthwave: {
    id: "synthwave",
    label: "Synthwave",
    family: "electronic",
    tempo: [86, 112],
    swing: 0,
    swingGrid: 16,
    form: "song",
    modes: [["aeolian", 4], ["dorian", 1], ["ionian", 1]],
    progressions: {
      minor: [["i", "bVI", "bIII", "bVII"], ["i", "bVII", "bVI", "bVII"], ["i", "iv", "bVI", "v"]],
      major: [["I", "V", "vi", "IV"], ["IV", "V", "iii", "vi"]],
    },
    barsPerChord: 1,
    drums: {
      kit: "gated",
      level: 0.9,
      patterns: [
        { kick: "x.......x.......", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
        { kick: "x.....x.x.......", snare: "....X.......X...", hat: "xgxgxgxgxgxgxgxg" },
      ],
    },
    bass: { timbres: [["saw", 3], ["square", 1]], styles: [["pulse16", 4], ["root8", 1]], octave: 2 },
    harmony: { insts: [["pad", 3], ["supersaw", 2], ["brass", 1]], rhythms: { pad: "sustain", supersaw: "pulse8", brass: "swells" }, extend: false },
    lead: { insts: [["sawLead", 3], ["squareLead", 1], ["bell", 1]], style: "straight", density: 0.5, scale: "mode" },
    textures: ["riser", "tape", "shimmer"],
    dims: { space: 65, grit: 20, drumFeel: 55, pulse: 60, bass: 60, genrePull: 85 },
    energy: 0.6,
  },
  ambient: {
    id: "ambient",
    label: "Ambient",
    family: "hybrid",
    tempo: [60, 80],
    swing: 0,
    swingGrid: 16,
    form: "ambient",
    modes: [["lydian", 3], ["ionian", 2], ["dorian", 2], ["aeolian", 2]],
    progressions: {
      minor: [["i9", "bVImaj7"], ["isus2", "bVIImaj7", "bVImaj7", "isus2"], ["i9", "iv9"]],
      major: [["Imaj7", "IVmaj7"], ["Iadd9", "vi7", "IVmaj7", "Iadd9"], ["I", "II", "I", "II"]],
    },
    barsPerChord: 2,
    drums: {
      kit: "brush",
      level: 0.35,
      patterns: [
        { kick: "x...............", shaker: "..g...g...g...g." },
        { kick: "x.......x.......", rim: "....g.......g..." },
      ],
    },
    bass: { timbres: [["sub", 3], ["fm", 1]], styles: [["sustain", 4]], octave: 2 },
    harmony: { insts: [["pad", 3], ["strings", 1], ["choir", 2]], rhythms: { pad: "sustain", strings: "swells", choir: "swells" }, extend: true },
    lead: { insts: [["bell", 3], ["flute", 1], ["whistle", 1], ["epiano", 1]], style: "long", density: 0.25, scale: "pentatonic" },
    textures: ["wind", "shimmer", "drone"],
    dims: { space: 85, grit: 5, drumFeel: 15, pulse: 20, bass: 45, genrePull: 55 },
    energy: 0.25,
  },
  trance: {
    id: "trance",
    label: "Trance",
    family: "electronic",
    tempo: [132, 140],
    swing: 0,
    swingGrid: 16,
    form: "edm",
    modes: [["aeolian", 4], ["harmonicMinor", 1], ["phrygian", 1]],
    progressions: {
      minor: [["i", "bVI", "bIII", "bVII"], ["i", "bVII", "bVI", "v"], ["bVI", "bVII", "i", "i"]],
      major: [["vi", "IV", "I", "V"], ["IV", "V", "vi", "vi"]],
    },
    barsPerChord: 1,
    drums: {
      kit: "electronic",
      level: 0.95,
      patterns: [
        { kick: "x...x...x...x...", clap: "....x.......x...", hat: "gggggggggggggggg", open: "..x...x...x...x." },
        { kick: "x...x...x...x...", clap: "....x.......x...", open: "..x...x...x...x.", shaker: "g.gg.gg.g.gg.gg." },
      ],
    },
    bass: { timbres: [["saw", 2], ["reese", 1], ["fm", 1]], styles: [["rolling", 4], ["offbeat", 2]], octave: 2 },
    harmony: { insts: [["supersaw", 4], ["pad", 1], ["pluckArp", 2]], rhythms: { supersaw: "pulse8", pad: "sustain", pluckArp: "arp" }, extend: false },
    lead: { insts: [["sawLead", 3], ["pluck", 2], ["voice", 1]], style: "arp", density: 0.65, scale: "mode" },
    textures: ["riser", "impact", "shimmer"],
    dims: { space: 70, grit: 25, drumFeel: 65, pulse: 80, bass: 60, genrePull: 95 },
    energy: 0.85,
  },
  dnb: {
    id: "dnb",
    label: "Drum & bass",
    family: "electronic",
    tempo: [168, 176],
    swing: 0.05,
    swingGrid: 16,
    form: "edm",
    modes: [["aeolian", 3], ["dorian", 2]],
    progressions: {
      minor: [["i", "bVI", "bVII", "i"], ["i7", "iv7", "bVImaj7", "v7"]],
      major: [["vi", "IV", "I", "V"]],
    },
    barsPerChord: 2,
    drums: {
      kit: "electronic",
      level: 1,
      patterns: [
        { kick: "x.........x.....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", shaker: "gggggggggggggggg" },
        { kick: "x.....x...x.....", snare: "....X..g....X...", hat: "x.xgx.x.x.xgx.x." },
      ],
    },
    bass: { timbres: [["reese", 3], ["sub", 2]], styles: [["sustain", 2], ["syncopated", 2]], octave: 1 },
    harmony: { insts: [["pad", 3], ["epiano", 1], ["strings", 1]], rhythms: { pad: "sustain", epiano: "comp", strings: "swells" }, extend: true },
    lead: { insts: [["bell", 2], ["sawLead", 1], ["voice", 1]], style: "sparse", density: 0.4, scale: "mode" },
    textures: ["riser", "impact"],
    dims: { space: 55, grit: 35, drumFeel: 80, pulse: 85, bass: 70, genrePull: 90 },
    energy: 0.85,
  },
  folk: {
    id: "folk",
    label: "Folk / acoustic",
    family: "organic",
    tempo: [78, 112],
    swing: 0.2,
    swingGrid: 8,
    form: "song",
    modes: [["ionian", 4], ["mixolydian", 2], ["dorian", 1], ["aeolian", 2]],
    progressions: {
      minor: [["i", "bVII", "bVI", "bVII"], ["i", "iv", "i", "V"], ["i", "IV", "i", "IV"]],
      major: [["I", "IV", "I", "V"], ["I", "vi", "IV", "V"], ["I", "V", "vi", "IV"], ["Iadd9", "IV", "vi", "V"]],
    },
    barsPerChord: 1,
    drums: {
      kit: "brush",
      level: 0.7,
      patterns: [
        { kick: "x.......x.......", snare: "....x.......x...", shaker: "x.g.x.g.x.g.x.g." },
        { kick: "x...x...x...x...", snare: "g.gxg.gxg.gxg.gx" },
      ],
    },
    bass: { timbres: [["upright", 3], ["pluck", 1]], styles: [["rootFifth", 4], ["sustain", 1]], octave: 2 },
    harmony: { insts: [["strumGuitar", 5], ["piano", 1]], rhythms: { strumGuitar: "strum", piano: "sustain" }, extend: false, strum: "D.D.DU.UD.D.DU.U" },
    lead: { insts: [["banjo", 2], ["flute", 2], ["whistle", 1], ["voice", 2], ["harmonica", 1]], style: "straight", density: 0.45, scale: "pentatonic" },
    textures: ["wind"],
    dims: { space: 45, grit: 5, drumFeel: 30, pulse: 40, bass: 45, genrePull: 10 },
    energy: 0.4,
    rootPrefs: GUITAR_KEYS,
  },
  countryRock: {
    id: "countryRock",
    label: "Country rock",
    family: "organic",
    tempo: [100, 132],
    swing: 0.1,
    swingGrid: 8,
    form: "song",
    modes: [["ionian", 3], ["mixolydian", 3], ["aeolian", 1]],
    progressions: {
      minor: [["i", "bVII", "bVI", "V"], ["i", "bVI", "bVII", "i"]],
      major: [["I", "IV", "I", "V"], ["I", "V", "IV", "I"], ["I", "bVII", "IV", "I"], ["vi", "IV", "I", "V"]],
    },
    barsPerChord: 1,
    drums: {
      kit: "acoustic",
      level: 0.9,
      patterns: [
        { kick: "x.......x.x.....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
        { kick: "x...x...x...x...", snare: "g.gXg.g.g.gXg.g.", hat: "x.x.x.x.x.x.x.x." },
      ],
    },
    bass: { timbres: [["pluck", 3], ["upright", 1]], styles: [["rootFifth", 3], ["root8", 2]], octave: 2 },
    harmony: { insts: [["strumGuitar", 3], ["cleanGuitar", 2], ["organ", 1], ["distGuitar", 1]], rhythms: { strumGuitar: "strum", cleanGuitar: "pick", organ: "sustain", distGuitar: "power" }, extend: false, strum: "D.D.DUDUD.D.DUDU" },
    lead: { insts: [["guitar", 3], ["banjo", 2], ["harmonica", 1], ["distGuitar", 1]], style: "straight", density: 0.5, scale: "pentatonic" },
    textures: ["wind"],
    dims: { space: 40, grit: 30, drumFeel: 55, pulse: 60, bass: 55, genrePull: 15 },
    energy: 0.6,
    rootPrefs: GUITAR_KEYS,
  },
  rock: {
    id: "rock",
    label: "Rock",
    family: "organic",
    tempo: [108, 150],
    swing: 0,
    swingGrid: 8,
    form: "song",
    modes: [["aeolian", 3], ["mixolydian", 2], ["ionian", 2], ["dorian", 1]],
    progressions: {
      minor: [["i5", "bVI5", "bVII5", "i5"], ["i5", "bIII5", "bVII5", "IV5"], ["i5", "bVII5", "bVI5", "bVII5"]],
      major: [["I5", "bVII5", "IV5", "I5"], ["I5", "IV5", "V5", "IV5"], ["vi5", "IV5", "I5", "V5"]],
    },
    barsPerChord: 1,
    drums: {
      kit: "acoustic",
      level: 1,
      patterns: [
        { kick: "x.....x.x.......", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
        { kick: "x.x.....x.x..x..", snare: "....X.......X...", ride: "x.x.x.x.x.x.x.x." },
      ],
    },
    bass: { timbres: [["pluck", 3], ["square", 1]], styles: [["root8", 3], ["riff", 2]], octave: 2 },
    harmony: { insts: [["distGuitar", 5], ["organ", 1]], rhythms: { distGuitar: "power", organ: "sustain" }, extend: false },
    lead: { insts: [["distGuitar", 4], ["sawLead", 1], ["voice", 1]], style: "riff", density: 0.55, scale: "pentatonic" },
    textures: ["impact"],
    dims: { space: 35, grit: 70, drumFeel: 75, pulse: 70, bass: 60, genrePull: 25 },
    energy: 0.8,
    rootPrefs: GUITAR_KEYS,
  },
  blues: {
    id: "blues",
    label: "Blues",
    family: "organic",
    tempo: [62, 96],
    swing: 1,
    swingGrid: 8,
    form: "blues",
    modes: [["mixolydian", 4], ["dorian", 2]],
    progressions: {
      major: [["I7", "IV7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"]],
      minor: [["i7", "iv7", "i7", "i7", "iv7", "iv7", "i7", "i7", "bVI7", "V7", "i7", "V7"]],
    },
    barsPerChord: 1,
    drums: {
      kit: "brush",
      level: 0.9,
      patterns: [
        { kick: "x.......x.......", snare: "....x.......x...", ride: "x.x.x.x.x.x.x.x." },
        { kick: "x.....x.x.......", snare: "....x..g....x...", hat: "x.x.x.x.x.x.x.x." },
      ],
    },
    bass: { timbres: [["upright", 3], ["pluck", 1]], styles: [["walking", 4], ["rootFifth", 1]], octave: 2 },
    harmony: { insts: [["organ", 2], ["piano", 2], ["cleanGuitar", 2]], rhythms: { organ: "sustain", piano: "comp", cleanGuitar: "comp" }, extend: true },
    lead: { insts: [["guitar", 3], ["harmonica", 3], ["distGuitar", 1]], style: "bluesy", density: 0.45, scale: "blues" },
    textures: [],
    dims: { space: 40, grit: 35, drumFeel: 45, pulse: 40, bass: 55, genrePull: 10 },
    energy: 0.45,
    rootPrefs: GUITAR_KEYS,
  },
  lofi: {
    id: "lofi",
    label: "Lo-fi hip hop",
    family: "hybrid",
    tempo: [70, 90],
    swing: 0.55,
    swingGrid: 16,
    form: "song",
    modes: [["dorian", 3], ["ionian", 2], ["aeolian", 2]],
    progressions: {
      major: [["ii9", "V9", "Imaj9", "vi9"], ["IVmaj7", "iii7", "ii7", "Imaj7"], ["Imaj7", "vi9", "ii9", "V9"]],
      minor: [["i9", "iv9", "bVII9", "bIIImaj7"], ["i7", "bVImaj7", "iv7", "v7"]],
    },
    barsPerChord: 1,
    drums: {
      kit: "lofi",
      level: 1,
      patterns: [
        { kick: "x......x..x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x." },
        { kick: "x.........x..x..", snare: "....x.......x..g", hat: "xgx.xgx.xgx.xgx." },
      ],
    },
    bass: { timbres: [["sub", 2], ["upright", 2]], styles: [["sparse", 4]], octave: 2 },
    harmony: { insts: [["epiano", 3], ["piano", 3], ["cleanGuitar", 1]], rhythms: { epiano: "comp", piano: "sustain", cleanGuitar: "pick" }, extend: true },
    lead: { insts: [["epiano", 2], ["bell", 2], ["flute", 1], ["guitar", 1]], style: "sparse", density: 0.35, scale: "pentatonic" },
    textures: ["vinyl", "rain", "tape"],
    dims: { space: 45, grit: 25, drumFeel: 45, pulse: 35, bass: 60, genrePull: 45 },
    energy: 0.35,
  },
  boombap: {
    id: "boombap",
    label: "Hip hop (boom bap)",
    family: "hybrid",
    tempo: [84, 96],
    swing: 0.4,
    swingGrid: 16,
    form: "song",
    modes: [["aeolian", 3], ["dorian", 3], ["phrygian", 1]],
    progressions: {
      minor: [["i7", "i7", "iv7", "iv7"], ["i7", "bVImaj7", "i7", "bVImaj7"], ["i9", "bVII", "bVImaj7", "v7"]],
      major: [["Imaj7", "vi7", "ii7", "V7"]],
    },
    barsPerChord: 1,
    drums: {
      kit: "acoustic",
      level: 1,
      patterns: [
        { kick: "x.....x...x.....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." },
        { kick: "x..x......x..x..", snare: "....X.......X..g", hat: "x.xgx.x.x.xgx.x." },
      ],
    },
    bass: { timbres: [["sub", 2], ["upright", 2]], styles: [["sparse", 3], ["syncopated", 1]], octave: 2 },
    harmony: { insts: [["piano", 3], ["epiano", 2], ["strings", 1]], rhythms: { piano: "comp", epiano: "comp", strings: "sustain" }, extend: true },
    lead: { insts: [["piano", 2], ["bell", 2], ["flute", 1], ["brass", 1]], style: "sparse", density: 0.35, scale: "pentatonic" },
    textures: ["vinyl"],
    dims: { space: 35, grit: 35, drumFeel: 70, pulse: 55, bass: 65, genrePull: 40 },
    energy: 0.55,
  },
  trap: {
    id: "trap",
    label: "Trap",
    family: "electronic",
    tempo: [130, 150],
    swing: 0.05,
    swingGrid: 16,
    halfTime: true,
    form: "song",
    modes: [["aeolian", 3], ["phrygian", 2], ["harmonicMinor", 2]],
    progressions: {
      minor: [["i", "bVI", "i", "bVI"], ["i", "iv", "bVI", "v"], ["i", "bII", "i", "bII"]],
      major: [["vi", "IV", "I", "V"]],
    },
    barsPerChord: 2,
    drums: {
      kit: "808",
      level: 1,
      patterns: [
        { kick: "x......x..x.....", snare: "........X.......", hat: "x.x.x.x.x.x.r.x." },
        { kick: "x.....x...x..x..", clap: "........X.......", hat: "xxx.x.xrx.x.xxr." },
      ],
    },
    bass: { timbres: [["808", 5]], styles: [["slide808", 4]], octave: 1 },
    harmony: { insts: [["pad", 2], ["strings", 1], ["choir", 1], ["pluckArp", 2]], rhythms: { pad: "sustain", strings: "sustain", choir: "sustain", pluckArp: "arp" }, extend: false },
    lead: { insts: [["bell", 3], ["flute", 2], ["pluck", 1], ["voice", 1]], style: "syncopated", density: 0.45, scale: "mode" },
    textures: ["riser", "impact"],
    dims: { space: 45, grit: 40, drumFeel: 75, pulse: 70, bass: 80, genrePull: 85 },
    energy: 0.7,
  },
  cinematic: {
    id: "cinematic",
    label: "Cinematic / orchestral",
    family: "hybrid",
    tempo: [70, 100],
    swing: 0,
    swingGrid: 16,
    form: "cinematic",
    modes: [["aeolian", 4], ["harmonicMinor", 1], ["ionian", 2], ["lydian", 1]],
    progressions: {
      minor: [["i", "bVI", "bIII", "bVII"], ["i", "bVI", "iv", "V"], ["i", "iv", "bVI", "bVII"]],
      major: [["I", "V", "vi", "IV"], ["IV", "I", "V", "vi"], ["I", "iii", "IV", "iv"]],
    },
    barsPerChord: 1,
    drums: {
      kit: "cinematic",
      level: 0.85,
      patterns: [
        { kick: "x.......x.......", tom: "x..x..x.x..x..x.", snare: "....x.......x..." },
        { kick: "x.....x.x.......", tom: "x.x.x.x.x.xxx.x.", snare: "....x.......x..." },
      ],
    },
    bass: { timbres: [["sub", 2], ["fm", 1], ["upright", 1]], styles: [["sustain", 3], ["root8", 1]], octave: 1 },
    harmony: { insts: [["strings", 5], ["choir", 2], ["brass", 2], ["piano", 1]], rhythms: { strings: "swells", choir: "swells", brass: "swells", piano: "arp" }, extend: false },
    lead: { insts: [["strings", 3], ["brass", 2], ["piano", 1], ["flute", 1], ["voice", 1]], style: "long", density: 0.35, scale: "mode" },
    textures: ["impact", "riser", "drone"],
    dims: { space: 75, grit: 15, drumFeel: 55, pulse: 50, bass: 60, genrePull: 35 },
    energy: 0.6,
  },
  jazz: {
    id: "jazz",
    label: "Jazz",
    family: "organic",
    tempo: [92, 150],
    swing: 0.9,
    swingGrid: 8,
    form: "song",
    modes: [["dorian", 3], ["ionian", 3], ["mixolydian", 1]],
    progressions: {
      major: [["ii7", "V7", "Imaj7", "vi7"], ["Imaj7", "vi7", "ii7", "V7"], ["iii7", "vi7", "ii7", "V7"]],
      minor: [["iim7b5", "V7", "i7", "i7"], ["i7", "iv7", "bVII7", "bIIImaj7"]],
    },
    barsPerChord: 1,
    drums: {
      kit: "brush",
      level: 0.65,
      patterns: [
        { ride: "x...x.x.x...x.x.", hat: "....x.......x...", kick: "g.......g.......", snare: "......g.....g..g" },
        { ride: "x...x.x.x...x.x.", hat: "....x.......x...", snare: "...g...g..g...g." },
      ],
    },
    bass: { timbres: [["upright", 5]], styles: [["walking", 5]], octave: 2 },
    harmony: { insts: [["piano", 4], ["epiano", 2], ["cleanGuitar", 1]], rhythms: { piano: "comp", epiano: "comp", cleanGuitar: "comp" }, extend: true },
    lead: { insts: [["brass", 3], ["piano", 1], ["guitar", 1], ["flute", 1]], style: "bluesy", density: 0.55, scale: "mode" },
    textures: [],
    dims: { space: 40, grit: 10, drumFeel: 40, pulse: 50, bass: 55, genrePull: 5 },
    energy: 0.45,
  },
};

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
