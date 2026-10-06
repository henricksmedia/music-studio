/**
 * Style spec: the rhythm, harmony and production choices layered on top of a genre blend.
 * Every option carries a one-line plain-English explanation for the UI.
 * Overrides (= locks) come from the prompt, the Groove/Harmony panels, card chips or Go wild;
 * anything not overridden is picked by the composer within genre-faithful bounds.
 */
import type { GenreId, DrumKit, BassTimbre, HarmonyInst, LeadInst, BassStyle, HarmonyRhythm, MelodyStyle } from "./genres";
import type { ChordColorId, ModeId } from "./theory";

/* ------------------------------ rhythm ------------------------------ */

export type MeterId = "4/4" | "3/4" | "6/8" | "5/4" | "7/8" | "mixed";
export const METERS: Record<MeterId, { label: string; plain: string; steps: number[]; groupings: number[][] }> = {
  // steps: 16ths per bar (a cycle for mixed); groupings: eighth-note groups per bar
  "4/4": { label: "4/4", plain: "Steady four. Most pop, rock and dance music.", steps: [16], groupings: [[2, 2, 2, 2], [3, 3, 2], [3, 2, 3]] },
  "3/4": { label: "3/4", plain: "Waltz: ONE-two-three.", steps: [12], groupings: [[2, 2, 2]] },
  "6/8": { label: "6/8", plain: "Rolling: two big swaying beats, each split in three.", steps: [12], groupings: [[3, 3]] },
  "5/4": { label: "5/4", plain: "Five beats: lopsided but groovy (think 'Take Five').", steps: [20], groupings: [[3, 3, 2, 2], [2, 2, 3, 3], [2, 2, 2, 2, 2]] },
  "7/8": { label: "7/8", plain: "Seven: feels like a skip in your step.", steps: [14], groupings: [[2, 2, 3], [3, 2, 2], [2, 3, 2]] },
  mixed: { label: "Mixed bars", plain: "Mostly four, then a short bar that trips forward.", steps: [16, 16, 16, 14], groupings: [[2, 2, 2, 2]] },
};
export const METER_IDS = Object.keys(METERS) as MeterId[];
export const MIXED_CYCLES: { steps: number[]; label: string }[] = [
  { steps: [16, 16, 16, 14], label: "4/4 ×3 + 7/8" },
  { steps: [14, 14, 16], label: "7/8 + 7/8 + 4/4" },
  { steps: [12, 12, 16, 16], label: "3/4 ×2 + 4/4 ×2" },
  { steps: [16, 20], label: "4/4 + 5/4" },
];

export type FeelId = "straight" | "swing" | "shuffle";
export const FEELS: Record<FeelId, { label: string; plain: string }> = {
  straight: { label: "Straight", plain: "Even, tight 8ths and 16ths." },
  swing: { label: "Swing", plain: "Long-short bounce." },
  shuffle: { label: "Shuffle", plain: "Heavy triplet lope, blues and boogie style." },
};

export type TrickId =
  | "backbeat"
  | "halftime"
  | "clave"
  | "breaks"
  | "hemiola"
  | "crossRhythm"
  | "polyrhythm"
  | "polymeter"
  | "layering"
  | "triplets"
  | "quintuplets"
  | "septuplets"
  | "syncopation"
  | "displacement"
  | "isorhythm"
  | "ostinato"
  | "callResponse"
  | "dotted"
  | "brokenTime"
  | "deconstruction"
  | "jitter"
  | "glitch"
  | "humanize"
  | "additive";

export const TRICKS: Record<TrickId, { label: string; plain: string; group: "pulse" | "cycles" | "subdivision" | "feel" | "parts" }> = {
  backbeat: { label: "Backbeat", plain: "Snare cracks on 2 and 4: the pop and rock anchor.", group: "pulse" },
  halftime: { label: "Half-time", plain: "Snare only on 3. Feels twice as slow and heavy.", group: "pulse" },
  clave: { label: "Clave", plain: "The Afro-Cuban key pattern (3+2 or 2+3) that locks everything together.", group: "pulse" },
  breaks: { label: "Syncopated breaks", plain: "The band hits together on off-beats, then stops dead.", group: "pulse" },
  syncopation: { label: "Syncopation", plain: "Accents land between the beats.", group: "pulse" },
  additive: { label: "Additive groups", plain: "Beats grouped unevenly, like 3+3+2 or 2+2+3.", group: "pulse" },
  hemiola: { label: "Hemiola", plain: "Feels like it flips between 2 and 3.", group: "cycles" },
  crossRhythm: { label: "3 over 4", plain: "Chords hit 3 evenly spaced times while the drums keep 4.", group: "cycles" },
  polyrhythm: { label: "Polyrhythm", plain: "Two pulses at once (like 3:4) that only meet on the 1.", group: "cycles" },
  polymeter: { label: "Polymeter", plain: "A riff of a different length (like 7) loops over the 4-beat bar and realigns every phrase.", group: "cycles" },
  layering: { label: "Layered cycles", plain: "Drums, bass and melody each loop at their own length, interlocking.", group: "cycles" },
  isorhythm: { label: "Isorhythm", plain: "The rhythm loop and the note loop are different lengths, so the bass keeps recombining.", group: "cycles" },
  triplets: { label: "Triplets", plain: "Fills and runs split a beat into 3.", group: "subdivision" },
  quintuplets: { label: "Quintuplets", plain: "Fills and runs split a beat into 5. Slippery.", group: "subdivision" },
  septuplets: { label: "Septuplets", plain: "Fills and runs split a beat into 7. Blurry and fast.", group: "subdivision" },
  dotted: { label: "Dotted rhythms", plain: "Long-short galloping notes and echoes.", group: "subdivision" },
  displacement: { label: "Displacement", plain: "A part shifts an 8th late in the B section so it feels new.", group: "parts" },
  ostinato: { label: "Ostinato", plain: "One short figure repeats all song. Hypnotic.", group: "parts" },
  callResponse: { label: "Call & response", plain: "The lead asks and a second voice answers.", group: "parts" },
  brokenTime: { label: "Broken time", plain: "Kick and snare dodge the expected spots (breakbeat feel).", group: "feel" },
  deconstruction: { label: "Deconstruction", plain: "The beat falls apart in quiet parts, then snaps back.", group: "feel" },
  jitter: { label: "Beat jitter", plain: "Deliberately loose, drunk timing.", group: "feel" },
  glitch: { label: "Glitch stutter", plain: "Stutters, chopped repeats and ratchets at phrase ends.", group: "feel" },
  humanize: { label: "Humanize", plain: "Tiny push and pull in timing and loudness, like a real player.", group: "feel" },
};
export const TRICK_IDS = Object.keys(TRICKS) as TrickId[];

export const POLY_RATIOS: [number, number][] = [[3, 4], [3, 2], [5, 4], [5, 7], [7, 4]];
export const POLYMETER_CYCLES = [7, 5, 3, 9]; // in 8ths over the bar

/* ------------------------------ harmony ------------------------------ */

export const CHORD_COLORS: Record<ChordColorId, { label: string; plain: string }> = {
  auto: { label: "Style's own", plain: "Let the genre decide." },
  plain: { label: "Major/minor", plain: "Simple, strong triads." },
  sus: { label: "Sus2/Sus4", plain: "Open and unresolved, airy." },
  sevenths: { label: "Sevenths", plain: "Smoother, soulful, a bit jazzy." },
  rich: { label: "Rich 9ths", plain: "Lush, dreamy, expensive-sounding." },
  power: { label: "Power 5ths", plain: "No 3rd: raw rock punch." },
  diminished: { label: "Diminished", plain: "A tense passing chord, film suspense." },
  augmented: { label: "Augmented", plain: "Floating, unsettled lift into the next chord." },
};

export type ProgressionId =
  | "popUplift"
  | "epic"
  | "darkTrap"
  | "dreamy"
  | "andalusian"
  | "royalRoad"
  | "doowop"
  | "mixoRock"
  | "dorianVamp"
  | "phrygianTension"
  | "minorPlagal"
  | "locrianUnrest";

export const PROGRESSIONS: Record<ProgressionId, { label: string; roman: string[]; family: "major" | "minor"; mode?: ModeId; plain: string }> = {
  popUplift: { label: "Pop Uplift", roman: ["I", "V", "vi", "IV"], family: "major", plain: "I–V–vi–IV: the feel-good chart loop." },
  epic: { label: "Epic", roman: ["vi", "IV", "I", "V"], family: "major", plain: "vi–IV–I–V: starts in shadow and climbs to daylight." },
  darkTrap: { label: "Dark Trap", roman: ["i", "bVI", "bVII", "i"], family: "minor", plain: "i–VI–VII: three heavy steps that never quite resolve." },
  dreamy: { label: "Dreamy (Lydian)", roman: ["I", "II", "IV", "I"], family: "major", mode: "lydian", plain: "I–II–IV: the raised 4th makes it float." },
  andalusian: { label: "Andalusian", roman: ["i", "bVII", "bVI", "V"], family: "minor", plain: "Walks down step by step: flamenco and desert drama." },
  royalRoad: { label: "Royal Road", roman: ["IV", "V", "iii", "vi"], family: "major", plain: "Bittersweet longing, loved in J-pop and anime." },
  doowop: { label: "Doo-wop", roman: ["I", "vi", "IV", "V"], family: "major", plain: "Classic 50s sway." },
  mixoRock: { label: "Mixolydian rock", roman: ["I", "bVII", "IV", "I"], family: "major", mode: "mixolydian", plain: "Bright but bluesy classic-rock swagger." },
  dorianVamp: { label: "Dorian vamp", roman: ["i", "IV", "i", "IV"], family: "minor", mode: "dorian", plain: "Two chords with a soulful lift on the second." },
  phrygianTension: { label: "Phrygian tension", roman: ["i", "bII", "i", "bII"], family: "minor", mode: "phrygian", plain: "The half-step up feels exotic and tense." },
  minorPlagal: { label: "Minor plagal", roman: ["i", "iv", "i", "iv"], family: "minor", plain: "A melancholy back-and-forth, gospel-blues ache." },
  locrianUnrest: { label: "Locrian unrest", roman: ["idim", "bII", "bvii", "bII"], family: "minor", mode: "locrian", plain: "Built on a shaky diminished home chord. It never settles." },
};
export const PROGRESSION_IDS = Object.keys(PROGRESSIONS) as ProgressionId[];

export const HARMONY_TRICKS = {
  pedal: { label: "Pedal tone", plain: "The bass holds the home note while chords move above it: tension." },
  drone: { label: "Drone", plain: "A constant hum under everything." },
  borrowed: { label: "Borrowed chords", plain: "Steals a chord from the opposite mood for a bittersweet twist." },
  chromatic: { label: "Chromatic tension", plain: "Half-step slides into chords and between notes." },
} as const;
export type HarmonyTrickId = keyof typeof HARMONY_TRICKS;

/* ------------------------------ production ------------------------------ */

export type HookId = "riff" | "bassline" | "chords" | "stab" | "rhythm" | "texture";
export const HOOKS: Record<HookId, { label: string; plain: string }> = {
  riff: { label: "Lead riff", plain: "A short melody that comes back every hook." },
  bassline: { label: "Bassline", plain: "The bass figure is the thing you hum." },
  chords: { label: "Chord rhythm", plain: "A distinctive chord pattern is the hook." },
  stab: { label: "Stab", plain: "Short punchy chord hits on off-beats." },
  rhythm: { label: "Rhythm motif", plain: "A percussion figure that returns." },
  texture: { label: "Texture motif", plain: "A recurring bell or vocal-chop figure." },
};

export type OpeningId = "filteredPads" | "soloBass" | "distantDrone" | "hookFragment" | "drumsAlone" | "textureBed";
export const OPENINGS: Record<OpeningId, { label: string; plain: string }> = {
  filteredPads: { label: "Filtered chords", plain: "Muffled chords that slowly open up." },
  soloBass: { label: "Solo bass", plain: "The bassline alone, then the rest joins." },
  distantDrone: { label: "Distant drone", plain: "A far-away hum and room tone." },
  hookFragment: { label: "Hook fragment", plain: "A tease of the hook, muffled and far away." },
  drumsAlone: { label: "Drums alone", plain: "Just the beat, then layers stack up." },
  textureBed: { label: "Texture bed", plain: "Crackle, rain or tape hiss with a single sound on top." },
};

export type EndingId = "ritard" | "finalHit" | "fade" | "cut";
export const ENDINGS: Record<EndingId, { label: string; plain: string }> = {
  ritard: { label: "Slow down", plain: "Ritard: the band slows down into the last chord." },
  finalHit: { label: "Final hit", plain: "Everything stops, then one big last hit that rings out." },
  fade: { label: "Fade out", plain: "The music keeps going as the volume fades." },
  cut: { label: "Hard cut", plain: "Stops dead on the downbeat. Dry and abrupt." },
};

export type DevId = "filter" | "percRise" | "dropouts" | "widening" | "saturation" | "edits";
export const DEVELOPMENT: Record<DevId, { label: string; plain: string }> = {
  filter: { label: "Filter automation", plain: "Filters open and close to shape each section." },
  percRise: { label: "Rising percussion", plain: "Percussion gets busier toward the hooks." },
  dropouts: { label: "Drum dropouts", plain: "The drums drop out for a bar before big moments." },
  widening: { label: "Stereo widening", plain: "Narrow verses open into a wide hook." },
  saturation: { label: "Saturation push", plain: "More grit and drive as the energy rises." },
  edits: { label: "Rhythmic edits", plain: "Stutters and chopped repeats at phrase ends." },
};
export const DEV_IDS = Object.keys(DEVELOPMENT) as DevId[];

export type AvoidId =
  | "supersaws"
  | "trapHats"
  | "cinematicBooms"
  | "festivalBuilds"
  | "choirPads"
  | "cheesyPiano"
  | "genericRisers"
  | "orchestralSwells"
  | "808s"
  | "drums"
  | "vocals";
export const AVOIDS: Record<AvoidId, { label: string; plain: string; words: string }> = {
  supersaws: { label: "Supersaws", plain: "No big trance-style saw chords.", words: "supersaws?|super saws?|saw chords|hoovers?" },
  trapHats: { label: "Trap hats", plain: "No rattling hi-hat rolls.", words: "trap hats?|hat rolls?|hi ?hat rolls?|rolling hats?" },
  cinematicBooms: { label: "Cinematic booms", plain: "No trailer impacts or taiko booms.", words: "cinematic booms?|booms?|impacts?|trailer hits?|braams?" },
  festivalBuilds: { label: "Festival builds", plain: "No snare-roll-plus-riser EDM builds.", words: "festival builds?|edm builds?|snare rolls?|big room builds?|festival edm" },
  choirPads: { label: "Choir/voice pads", plain: "No choir or ooh/aah pads.", words: "choirs?|choir pads?|voice pads?|vocal pads?|oohs?|aahs?" },
  cheesyPiano: { label: "Cheesy piano", plain: "No plinky pop piano.", words: "cheesy piano|piano|pianos" },
  genericRisers: { label: "Generic risers", plain: "No white-noise risers.", words: "risers?|generic risers?|uplifters?|sweeps?" },
  orchestralSwells: { label: "Stock orchestral swells", plain: "No swelling string or brass beds.", words: "orchestral swells?|string swells?|swells?|stock strings|orchestra" },
  "808s": { label: "808s", plain: "No 808 kit or 808 bass.", words: "808s?|eight oh eights?" },
  drums: { label: "Drums", plain: "No drums at all.", words: "drums|percussion|beats?" },
  vocals: { label: "Vocals", plain: "Instrumental only: no voice-like sounds.", words: "vocals?|voices?|singing|vox" },
};
export const AVOID_IDS = Object.keys(AVOIDS) as AvoidId[];

export type VocalId = "instrumental" | "synthVoice";
export const VOCALS: Record<VocalId, { label: string; plain: string }> = {
  instrumental: { label: "Instrumental", plain: "No voice: instruments carry the melody." },
  synthVoice: { label: "Synthetic voice", plain: "A formant-synth 'voice' and vocal chops (no words)." },
};

export type ReverbId = "room" | "plate" | "hall" | "spring" | "shimmer";
export type DelayId = "dotted8" | "quarter" | "triplet8" | "slap";
export const REVERBS: Record<ReverbId, { label: string; plain: string }> = {
  room: { label: "Room", plain: "Short and close, like a small studio." },
  plate: { label: "Plate", plain: "Bright, smooth classic studio reverb." },
  hall: { label: "Hall", plain: "Big, dark and long." },
  spring: { label: "Spring", plain: "Twangy, boingy amp reverb (surf and blues)." },
  shimmer: { label: "Shimmer", plain: "Huge, glittering, endless tail." },
};
export const DELAYS: Record<DelayId, { label: string; plain: string }> = {
  dotted8: { label: "Dotted-8th echo", plain: "Galloping echoes (U2/trance style)." },
  quarter: { label: "Quarter echo", plain: "Echoes on the beat." },
  triplet8: { label: "Triplet echo", plain: "Swinging, rolling echoes." },
  slap: { label: "Slapback", plain: "One quick 50s rockabilly bounce." },
};

export type Fx = { reverb: ReverbId; delay: DelayId; pump: boolean; crush: boolean; tape: boolean };

export type MixGeometry = { pads: "wide" | "narrow"; drums: "dry" | "roomy"; contrast: boolean };

export type FormVariant = "classic" | "slowBurn" | "hookFirst";
export const FORM_VARIANTS: Record<FormVariant, { label: string; plain: string }> = {
  classic: { label: "Classic arc", plain: "Intro, groove, build, hook, dropout, B-groove, bridge, final hook." },
  slowBurn: { label: "Slow burn", plain: "A long intro and a late, big hook." },
  hookFirst: { label: "Hook first", plain: "Opens straight on the hook, then tells the story." },
};

/* ------------------------------ EDM fusion partners (Go wild) ------------------------------ */

export type EdmId =
  | "futureGarage"
  | "melodicTechno"
  | "psytrance"
  | "liquidDnb"
  | "deepHouse"
  | "acidHouse"
  | "breakbeat"
  | "darksynth"
  | "halftime"
  | "ukg"
  | "psybient"
  | "futureBass"
  | "electro"
  | "cyberTrance"
  | "dubTechno"
  | "tripHop"
  | "glitchHop";

export type EdmProfile = {
  label: string;
  genre: GenreId;
  bpm: [number, number];
  feel?: FeelId;
  swing?: number;
  tricks?: TrickId[];
  kit?: DrumKit;
  bass?: BassTimbre[];
  bassStyle?: BassStyle;
  harmony?: HarmonyInst[];
  lead?: LeadInst[];
  modes?: ModeId[];
  reverb?: ReverbId;
  delay?: DelayId;
  pump?: boolean;
  gear: string[];
};

export const EDM: Record<EdmId, EdmProfile> = {
  futureGarage: { label: "Future Garage", genre: "house", bpm: [130, 138], feel: "swing", swing: 0.55, tricks: ["brokenTime", "glitch"], bass: ["reese", "sub"], harmony: ["pad", "epiano"], lead: ["voice", "bell"], reverb: "hall", gear: ["Akai MPC2000XL", "Roland Juno-106"] },
  melodicTechno: { label: "Melodic Techno", genre: "techno", bpm: [120, 126], tricks: ["polymeter", "ostinato"], bass: ["sub", "fm"], harmony: ["pluckArp", "pad"], lead: ["fmLead", "bell"], modes: ["aeolian", "dorian"], gear: ["Moog Subsequent 37", "Roland TR-909"] },
  psytrance: { label: "Psytrance", genre: "trance", bpm: [138, 146], bass: ["acid", "saw"], bassStyle: "rolling", lead: ["acidLead", "fmLead"], modes: ["phrygian", "harmonicMinor"], gear: ["Access Virus TI", "Clavia Nord Lead 2"] },
  liquidDnb: { label: "Liquid Drum & Bass", genre: "dnb", bpm: [170, 176], harmony: ["epiano", "pad"], bass: ["sub", "reese"], gear: ["Fender Rhodes Mark I", "Akai S950"] },
  deepHouse: { label: "Deep House", genre: "house", bpm: [118, 124], swing: 0.3, harmony: ["organ", "epiano"], bass: ["sub", "fm"], gear: ["Roland TR-909", "Korg M1"] },
  acidHouse: { label: "Acid House", genre: "house", bpm: [120, 128], bass: ["acid"], lead: ["acidLead"], gear: ["Roland TB-303", "Roland TR-808"] },
  breakbeat: { label: "Breakbeat", genre: "dnb", bpm: [125, 136], tricks: ["brokenTime", "syncopation"], gear: ["E-mu SP-1200", "Akai MPC60"] },
  darksynth: { label: "Darksynth", genre: "synthwave", bpm: [100, 118], bass: ["saw", "reese"], modes: ["aeolian", "phrygian"], gear: ["Sequential Prophet-5", "LinnDrum LM-2"] },
  halftime: { label: "Halftime Bass", genre: "dnb", bpm: [160, 174], tricks: ["halftime"], bass: ["reese"], gear: ["Elektron Analog Rytm", "Moog Sub 37"] },
  ukg: { label: "UK Garage (2-step)", genre: "house", bpm: [130, 136], feel: "swing", swing: 0.6, tricks: ["brokenTime", "syncopation"], bass: ["sub", "fm"], harmony: ["organ", "epiano"], gear: ["Akai MPC3000", "Korg Triton"] },
  psybient: { label: "Psybient", genre: "ambient", bpm: [90, 105], tricks: ["polyrhythm", "layering"], reverb: "shimmer", gear: ["Roland Space Echo RE-201", "Moog Matriarch"] },
  futureBass: { label: "Future Bass", genre: "trap", bpm: [140, 160], harmony: ["supersaw"], pump: true, gear: ["Roland JP-8000", "Roland TR-808"] },
  electro: { label: "Electro", genre: "techno", bpm: [125, 132], kit: "808", bass: ["square"], gear: ["Roland TR-808", "Korg MS-20"] },
  cyberTrance: { label: "Cyber-Trance", genre: "trance", bpm: [136, 142], harmony: ["supersaw", "pluckArp"], pump: true, gear: ["Roland JP-8000", "Clavia Nord Lead 2"] },
  dubTechno: { label: "Dub Techno", genre: "techno", bpm: [118, 124], harmony: ["pad"], delay: "dotted8", reverb: "hall", gear: ["Roland Space Echo RE-201", "Sequential Prophet-5"] },
  tripHop: { label: "Trip Hop", genre: "boombap", bpm: [80, 95], tricks: ["humanize"], harmony: ["epiano", "strings"], reverb: "spring", gear: ["Akai MPC60", "Fender Rhodes Mark I"] },
  glitchHop: { label: "Glitch Hop", genre: "boombap", bpm: [100, 110], tricks: ["glitch", "syncopation"], gear: ["Elektron Octatrack", "Akai MPC2000XL"] },
};
export const EDM_IDS = Object.keys(EDM) as EdmId[];

/** Specific substyle names per base genre, for the Identity card. */
export const SUBSTYLES: Record<GenreId, string[]> = {
  house: ["Deep House", "Tech House", "French House", "Afro House"],
  techno: ["Melodic Techno", "Industrial Techno", "Minimal Techno", "Dub Techno"],
  synthwave: ["Outrun", "Darksynth", "Dreamwave"],
  ambient: ["Dark Ambient", "Psybient", "Drone Ambient", "Space Ambient"],
  trance: ["Psytrance", "Uplifting Trance", "Cyber-Trance", "Progressive Trance"],
  dnb: ["Liquid Drum & Bass", "Neurofunk", "Jungle"],
  folk: ["Appalachian Folk", "Campfire Folk", "Indie Folk"],
  countryRock: ["Desert Country Rock", "Heartland Rock", "Outlaw Country"],
  rock: ["Garage Rock", "Stoner Rock", "Arena Rock", "Post-Punk"],
  blues: ["Delta Blues", "Chicago Blues", "Texas Blues"],
  lofi: ["Lo-fi Hip Hop", "Chillhop", "Jazzhop"],
  boombap: ["Boom Bap", "Jazz Rap Instrumental", "Trip Hop"],
  trap: ["Dark Trap", "Drill", "Phonk"],
  cinematic: ["Epic Trailer", "Dark Score", "Hybrid Orchestral", "Western Score"],
  jazz: ["Cool Jazz", "Modal Jazz", "Nu-Jazz"],
};

/* ------------------------------ gear (flavor only) ------------------------------ */

export type GearRole = "kit" | "bass" | "harmony" | "lead" | "fx";
export type GearItem = { name: string; role: GearRole; value: string };
export const GEAR: GearItem[] = [
  { name: "Roland TR-808", role: "kit", value: "808" },
  { name: "Roland TR-909", role: "kit", value: "electronic" },
  { name: "LinnDrum LM-2", role: "kit", value: "gated" },
  { name: "Ludwig Supraphonic kit", role: "kit", value: "acoustic" },
  { name: "Akai MPC60", role: "kit", value: "lofi" },
  { name: "Gretsch kit with brushes", role: "kit", value: "brush" },
  { name: "Taiko ensemble", role: "kit", value: "cinematic" },
  { name: "Moog Minimoog Model D", role: "bass", value: "saw" },
  { name: "Roland TB-303", role: "bass", value: "acid" },
  { name: "Roland TR-808 bass drum (as 808 bass)", role: "bass", value: "808" },
  { name: "Yamaha DX7 (FM bass)", role: "bass", value: "fm" },
  { name: "Kay M-1 upright bass", role: "bass", value: "upright" },
  { name: "Fender Precision Bass", role: "bass", value: "pluck" },
  { name: "Sequential Pro-One", role: "bass", value: "square" },
  { name: "Moog Sub 37 (sub)", role: "bass", value: "sub" },
  { name: "Reese-style detuned bass (Korg MS-20)", role: "bass", value: "reese" },
  { name: "Roland Juno-106", role: "harmony", value: "pad" },
  { name: "Roland JP-8000", role: "harmony", value: "supersaw" },
  { name: "Steinway Model D", role: "harmony", value: "piano" },
  { name: "Fender Rhodes Mark I", role: "harmony", value: "epiano" },
  { name: "Hammond B-3 + Leslie 122", role: "harmony", value: "organ" },
  { name: "Martin D-28", role: "harmony", value: "strumGuitar" },
  { name: "Gibson ES-335", role: "harmony", value: "cleanGuitar" },
  { name: "Gibson Les Paul into a Marshall JCM800", role: "harmony", value: "distGuitar" },
  { name: "Sequential Prophet-5 (arp)", role: "harmony", value: "pluckArp" },
  { name: "Mellotron M400 strings", role: "harmony", value: "strings" },
  { name: "Oberheim OB-Xa brass", role: "harmony", value: "brass" },
  { name: "Hohner Marine Band harmonica", role: "lead", value: "harmonica" },
  { name: "National Reso-Phonic Tricone (slide)", role: "lead", value: "guitar" },
  { name: "Fender Telecaster", role: "lead", value: "guitar" },
  { name: "Deering Goodtime banjo", role: "lead", value: "banjo" },
  { name: "Moog Minimoog lead", role: "lead", value: "sawLead" },
  { name: "Roland TB-303 (acid lead)", role: "lead", value: "acidLead" },
  { name: "Yamaha DX7 bells", role: "lead", value: "bell" },
  { name: "Clavia Nord Lead 2", role: "lead", value: "squareLead" },
  { name: "Mellotron M400 flute", role: "lead", value: "flute" },
  { name: "Gibson SG with fuzz", role: "lead", value: "distGuitar" },
  { name: "Roland VP-330 vocoder", role: "lead", value: "voice" },
  { name: "Roland Space Echo RE-201", role: "fx", value: "dotted8" },
  { name: "EMT 140 plate", role: "fx", value: "plate" },
  { name: "Fender '65 Twin Reverb (spring)", role: "fx", value: "spring" },
  { name: "Lexicon 480L hall", role: "fx", value: "hall" },
  { name: "Eventide H9 shimmer", role: "fx", value: "shimmer" },
  { name: "Studer A800 tape", role: "fx", value: "tape" },
  { name: "Elektron Octatrack (glitch edits)", role: "fx", value: "glitch" },
];

/* ------------------------------ overrides (locks) + resolved spec ------------------------------ */

export type StyleOverrides = {
  meter?: MeterId;
  mixedCycle?: number; // index into MIXED_CYCLES
  grouping?: number[];
  feel?: FeelId;
  swing?: number; // 0..100
  syncopation?: number; // 0..100
  humanize?: number; // 0..100
  glitch?: number; // 0..100
  tricks?: Partial<Record<TrickId, boolean>>;
  polyRatio?: [number, number];
  polymeterCycle?: number;
  clave?: "3-2" | "2-3";
  chordColor?: ChordColorId;
  progression?: ProgressionId | "genre";
  harmonyTricks?: Partial<Record<HarmonyTrickId, boolean>>;
  hook?: HookId;
  opening?: OpeningId;
  ending?: EndingId;
  vocal?: VocalId;
  pads?: MixGeometry["pads"];
  drumsRoom?: MixGeometry["drums"];
  contrast?: boolean;
  avoid?: AvoidId[];
  reverb?: ReverbId;
  delay?: DelayId;
  pump?: boolean;
  crush?: boolean;
  tape?: boolean;
  development?: Partial<Record<DevId, boolean>>;
  form?: FormVariant;
  bassStyle?: BassStyle;
  harmonyRhythm?: HarmonyRhythm;
  melodyStyle?: MelodyStyle;
  edm?: EdmId;
  substyle?: string;
  gear?: string[];
  lyricTheme?: string;
  wild?: boolean;
};

export type RhythmSpec = {
  meter: MeterId;
  cycle: number[]; // steps per bar, repeating
  meterLabel: string;
  grouping: number[]; // 8ths
  feel: FeelId;
  swing: number; // 0..1
  syncopation: number; // 0..1
  humanize: number; // 0..1
  glitch: number; // 0..1
  tricks: TrickId[];
  polyRatio: [number, number];
  polymeterCycle: number;
  clave: "3-2" | "2-3";
};

export type HarmonySpec = {
  chordColor: ChordColorId;
  progression: ProgressionId | "genre";
  pedal: boolean;
  drone: boolean;
  borrowed: boolean;
  chromatic: boolean;
};

export type ProductionSpec = {
  hook: HookId;
  opening: OpeningId;
  ending: EndingId;
  vocal: VocalId;
  mix: MixGeometry;
  avoid: AvoidId[];
  fx: Fx;
  development: DevId[];
  form: FormVariant;
  edm?: EdmId;
  substyle: string;
  gear: string[];
  lyricTheme: string;
  wild: boolean;
};

export type StyleSpec = { rhythm: RhythmSpec; harmony: HarmonySpec; production: ProductionSpec };

export const LYRIC_THEMES = [
  "a drifter's last train out of a flooded delta town",
  "neon reflections on a rain-soaked highway at 4am",
  "a lighthouse keeper talking to satellites",
  "an old bluesman's guitar that still remembers every crossroads",
  "leaving a city that never learned your name",
  "a desert radio station broadcasting to no one",
  "two strangers dancing in a power cut",
  "the ghost of a juke joint under a data center",
  "a heist planned entirely in whispers",
  "running from your own reflection",
  "a river that keeps every promise you threw in it",
  "a robot learning to hum the blues",
];

/** Merge override layers: later layers win; tricks/dev/harmonyTricks maps merge key by key. */
export function mergeOverrides(...layers: (StyleOverrides | undefined)[]): StyleOverrides {
  const out: StyleOverrides = {};
  for (const l of layers) {
    if (!l) continue;
    for (const [k, v] of Object.entries(l) as [keyof StyleOverrides, unknown][]) {
      if (v === undefined) continue;
      if (k === "tricks" || k === "development" || k === "harmonyTricks") {
        (out as Record<string, unknown>)[k] = { ...((out[k] as object) ?? {}), ...(v as object) };
      } else (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}
