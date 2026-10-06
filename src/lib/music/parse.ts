/**
 * Prompt understanding — local, rule-based, synonym-rich.
 * Maps words onto genre weights, moods, tempo, key, instruments, textures and dimension hints.
 */
import { parseStyle } from "./parseStyle";
import { EDM, PROGRESSIONS, mergeOverrides, type StyleOverrides } from "./spec";
import { GENRES, GENRE_IDS, type GenreId, type LeadInst, type HarmonyInst, type BassTimbre, type TextureId, type DrumKit } from "./genres";
import { MODES, MODE_IDS, type ModeId } from "./theory";
import { hashString, makeRng } from "./rng";
import type { Dimensions } from "../types";

export type MoodId =
  | "dark"
  | "happy"
  | "lonely"
  | "dreamy"
  | "aggressive"
  | "chill"
  | "epic"
  | "romantic"
  | "mysterious"
  | "nostalgic"
  | "hopeful"
  | "energetic"
  | "eerie"
  | "warm";

export const MOODS: Record<MoodId, { label: string; modes: Partial<Record<ModeId, number>>; dims: Partial<Dimensions>; energy: number; tempo: number }> = {
  dark: { label: "dark", modes: { phrygian: 3, aeolian: 2, harmonicMinor: 2 }, dims: { grit: 15, space: 10 }, energy: 0, tempo: 0 },
  happy: { label: "happy", modes: { ionian: 4, lydian: 1, mixolydian: 2 }, dims: { space: -5 }, energy: 0.1, tempo: 4 },
  lonely: { label: "lonely", modes: { aeolian: 3, dorian: 2 }, dims: { space: 20, drumFeel: -15, pulse: -10 }, energy: -0.15, tempo: -6 },
  dreamy: { label: "dreamy", modes: { lydian: 4, ionian: 1, dorian: 1 }, dims: { space: 25, grit: -10, vocalCharacter: -15 }, energy: -0.1, tempo: -4 },
  aggressive: { label: "aggressive", modes: { phrygian: 3, aeolian: 2 }, dims: { grit: 30, drumFeel: 20, pulse: 15, space: -10 }, energy: 0.25, tempo: 8 },
  chill: { label: "chill", modes: { dorian: 2, ionian: 2 }, dims: { drumFeel: -15, pulse: -15, grit: -10, space: 10 }, energy: -0.2, tempo: -8 },
  epic: { label: "epic", modes: { aeolian: 3, harmonicMinor: 1 }, dims: { space: 20, drumFeel: 15, bass: 10 }, energy: 0.2, tempo: 0 },
  romantic: { label: "romantic", modes: { ionian: 2, dorian: 1, lydian: 1 }, dims: { space: 10, grit: -10, vocalCharacter: 10 }, energy: -0.1, tempo: -4 },
  mysterious: { label: "mysterious", modes: { dorian: 2, phrygian: 2, harmonicMinor: 1 }, dims: { space: 15 }, energy: -0.05, tempo: -2 },
  nostalgic: { label: "nostalgic", modes: { ionian: 1, mixolydian: 1, dorian: 2 }, dims: { space: 10, grit: 5 }, energy: -0.05, tempo: -2 },
  hopeful: { label: "hopeful", modes: { ionian: 3, lydian: 2, mixolydian: 1 }, dims: { space: 10 }, energy: 0.05, tempo: 2 },
  energetic: { label: "energetic", modes: {}, dims: { drumFeel: 20, pulse: 25 }, energy: 0.3, tempo: 10 },
  eerie: { label: "eerie", modes: { phrygian: 3, harmonicMinor: 2, lydian: 1 }, dims: { space: 25, grit: 5 }, energy: -0.15, tempo: -6 },
  warm: { label: "warm", modes: { ionian: 2, mixolydian: 1, dorian: 1 }, dims: { grit: -5, bass: 10 }, energy: 0, tempo: 0 },
};
export const MOOD_IDS = Object.keys(MOODS) as MoodId[];

type LexEntry = {
  re: RegExp;
  genres?: Partial<Record<GenreId, number>>;
  moods?: MoodId[];
  dims?: Partial<Dimensions>;
  tempo?: number;
  energy?: number;
  lead?: LeadInst;
  harmony?: HarmonyInst;
  bass?: BassTimbre;
  kit?: DrumKit;
  textures?: TextureId[];
};

const w = (s: string) => new RegExp(`\\b(?:${s})\\b`, "g");

/** Genre words (strong). */
const GENRE_LEX: LexEntry[] = [
  { re: w("deep house|house|disco house|garage|nu disco|disco|funky house|club"), genres: { house: 1 } },
  { re: w("techno|warehouse|industrial|minimal|berghain|acid"), genres: { techno: 1 } },
  { re: w("synthwave|synth wave|retrowave|outrun|vaporwave|darksynth|synthpop|synth pop|new wave"), genres: { synthwave: 1 } },
  { re: w("ambient|drone|soundscape|atmospheric|meditation|meditative|new age|spa|sleep"), genres: { ambient: 1 } },
  { re: w("trance|psytrance|psy|uplifting|cyber ?trance|cytrance|cyborg|hard ?style|rave|euphoric|edm"), genres: { trance: 1 } },
  { re: w("drum and bass|drum ?n ?bass|dnb|d&b|jungle|liquid|breakbeat|breaks"), genres: { dnb: 1 } },
  { re: w("folk|acoustic|singer songwriter|bluegrass|appalachian|celtic|irish|americana|indie folk|campfire|ballad"), genres: { folk: 1 } },
  { re: w("country rock|southern rock|country|honky tonk|western|cowboy|outlaw|nashville|twang|red dirt|heartland"), genres: { countryRock: 1 } },
  { re: w("rock|punk|grunge|garage rock|indie rock|alt rock|alternative|metal|hard rock|stadium|power chords?|riffs?"), genres: { rock: 1 } },
  { re: w("blues|bluesy|delta|juke joint|bayou|swamp|shuffle|12 bar|twelve bar"), genres: { blues: 1 } },
  { re: w("lo ?fi|lofi|study beats?|chillhop|chill hop|jazzhop|bedroom"), genres: { lofi: 1 } },
  { re: w("boom ?bap|hip ?hop|rap|90s hip hop|old school|golden era|beats? tape|sample flip"), genres: { boombap: 1 } },
  { re: w("trap|drill|808s?|phonk|crunk|hi hat rolls?"), genres: { trap: 1 } },
  { re: w("cinematic|orchestral|orchestra|film|movie|score|soundtrack|trailer|epic|symphonic|heroic|battle|game music|boss fight"), genres: { cinematic: 1 } },
  { re: w("jazz|jazzy|bebop|swing|big band|lounge|smoky|speakeasy|noir|bossa"), genres: { jazz: 1 } },
  { re: w("electronic|electronica|edm|synths?|synthesizer|idm|dance|dancefloor|club"), genres: { house: 0.4, techno: 0.3, trance: 0.3 } },
  { re: w("indie|indie pop|pop"), genres: { folk: 0.3, synthwave: 0.3, rock: 0.3 } },
  { re: w("funk|funky|groove|groovy"), genres: { house: 0.5, boombap: 0.4, jazz: 0.2 } },
  { re: w("chillwave|downtempo|trip ?hop"), genres: { lofi: 0.6, ambient: 0.3, synthwave: 0.3 } },
  { re: w("gospel|soul|r ?& ?b|rnb|motown"), genres: { blues: 0.5, boombap: 0.4, jazz: 0.3 }, harmony: "organ" },
];

/** Places, eras, imagery. */
const SCENE_LEX: LexEntry[] = [
  { re: w("80s|eighties|1980s|retro|neon|miami|arcade|vhs|cassette"), genres: { synthwave: 0.9 }, moods: ["nostalgic"], textures: ["tape"] },
  { re: w("90s|nineties|1990s"), genres: { boombap: 0.4, house: 0.3, trance: 0.3 }, moods: ["nostalgic"] },
  { re: w("70s|seventies|1970s|vintage"), genres: { rock: 0.4, jazz: 0.2, house: 0.2 }, moods: ["nostalgic", "warm"], textures: ["tape"] },
  { re: w("60s|sixties|1960s"), genres: { folk: 0.4, rock: 0.3, blues: 0.3 }, moods: ["nostalgic"] },
  { re: w("desert|canyon|mesa|dust|dusty|tumbleweed|mojave|badlands"), genres: { countryRock: 0.6, ambient: 0.3 }, moods: ["lonely", "mysterious"], dims: { space: 20 }, textures: ["wind"] },
  { re: w("campfire|cabin|porch|front porch|hearth|fireside"), genres: { folk: 0.9 }, moods: ["warm"], dims: { space: -10 } },
  { re: w("forest|woods|mountains?|river|meadow|valley|highlands?|countryside"), genres: { folk: 0.6, ambient: 0.4 }, textures: ["wind"] },
  { re: w("ocean|sea|beach|waves|island|tropical|coast"), genres: { house: 0.4, ambient: 0.4 }, moods: ["dreamy"], dims: { space: 15 } },
  { re: w("summer|sunny|sunshine|pool party|festival"), genres: { house: 0.5, trance: 0.2 }, moods: ["happy", "energetic"] },
  { re: w("road ?trip|highway|interstate|truck|pickup|route 66|open road|driving"), genres: { countryRock: 0.6, synthwave: 0.4, rock: 0.3 }, dims: { pulse: 15 } },
  { re: w("night ?drive|nightdrive|midnight|night|city lights|downtown|neon city"), genres: { synthwave: 0.6, lofi: 0.2 }, moods: ["mysterious"] },
  { re: w("rain|rainy|storm|stormy|drizzle|thunder"), genres: { lofi: 0.6, ambient: 0.3 }, moods: ["lonely"], textures: ["rain"] },
  { re: w("cafe|coffee|coffeeshop|study|studying|homework|reading|library"), genres: { lofi: 0.8, jazz: 0.4 }, moods: ["chill"] },
  { re: w("space|cosmic|galaxy|stars|starlight|nebula|orbit|astronaut|planet"), genres: { ambient: 0.6, synthwave: 0.3, trance: 0.2 }, moods: ["dreamy"], dims: { space: 25 }, textures: ["shimmer"] },
  { re: w("cyber|cyberpunk|robot|robotic|android|machine|future|futuristic|dystopian|chrome|neural|glitch"), genres: { trance: 0.5, techno: 0.5, synthwave: 0.3 }, dims: { grit: 20, genrePull: 25 } },
  { re: w("church|cathedral|chapel|hymn|choir"), genres: { ambient: 0.4, cinematic: 0.4 }, harmony: "choir", dims: { space: 30 } },
  { re: w("bar|whiskey|whisky|saloon|dive bar|tavern|juke"), genres: { blues: 0.6, countryRock: 0.4 } },
  { re: w("warehouse|basement|underground|after ?hours|afterparty|rave"), genres: { techno: 0.7 }, moods: ["dark"] },
  { re: w("street|hood|block|cypher|corner"), genres: { boombap: 0.6, trap: 0.4 } },
  { re: w("trailer|war|army|kingdom|dragon|castle|quest|hero|adventure|fantasy"), genres: { cinematic: 0.8 }, moods: ["epic"] },
  { re: w("sunrise|dawn|morning"), moods: ["hopeful"], genres: { ambient: 0.3, folk: 0.3, trance: 0.2 } },
  { re: w("sunset|dusk|twilight|golden hour"), moods: ["nostalgic", "warm"], genres: { folk: 0.2, synthwave: 0.3, lofi: 0.2 } },
  { re: w("winter|snow|frozen|ice|cold"), moods: ["lonely"], dims: { space: 15 }, genres: { ambient: 0.4 } },
  { re: w("haunted|ghost|ghosts|horror|creepy|spooky|halloween|graveyard"), moods: ["eerie", "dark"], genres: { cinematic: 0.4, ambient: 0.3 } },
];

/** Moods. */
const MOOD_LEX: LexEntry[] = [
  { re: w("dark|darker|sinister|evil|menacing|ominous|gloomy|grim|brooding|heavy"), moods: ["dark"] },
  { re: w("happy|joyful|joy|cheerful|bright|uplifting|fun|playful|sunny|feel good|feelgood|bouncy|upbeat"), moods: ["happy"] },
  { re: w("lonely|alone|lonesome|sad|melancholy|melancholic|heartbreak|heartbroken|blue|crying|tears|longing|grief|somber|sombre"), moods: ["lonely"] },
  { re: w("dreamy|dream|dreams|floaty|floating|ethereal|hazy|haze|surreal|shoegaze|lush|airy"), moods: ["dreamy"] },
  { re: w("aggressive|angry|rage|furious|intense|hard|brutal|violent|savage|fierce|raw"), moods: ["aggressive"] },
  { re: w("chill|chilled|relaxed|relaxing|calm|mellow|laid ?back|lazy|easy|peaceful|soft|gentle|cozy|cosy"), moods: ["chill"] },
  { re: w("epic|huge|massive|big|grand|triumphant|anthemic|anthem|powerful"), moods: ["epic"] },
  { re: w("romantic|love|lover|sensual|sexy|tender|intimate"), moods: ["romantic"] },
  { re: w("mysterious|mystery|mystic|mystical|enigmatic|secret|curious|weird|strange"), moods: ["mysterious"] },
  { re: w("nostalgic|nostalgia|memories|memory|bittersweet|wistful|throwback|old"), moods: ["nostalgic"] },
  { re: w("hopeful|hope|optimistic|inspiring|inspirational|rising|free|freedom"), moods: ["hopeful"] },
  { re: w("energetic|energy|hype|hyped|pumping|banger|party|wild|crazy|frantic|explosive"), moods: ["energetic"] },
  { re: w("eerie|unsettling|tense|tension|suspense|suspenseful|creepy|uneasy"), moods: ["eerie"] },
  { re: w("warm|warmth|cozy|cosy|golden|sweet|home|homey"), moods: ["warm"] },
];

/** Tempo + feel words. */
const TEMPO_LEX: LexEntry[] = [
  { re: w("slow|slower|slowly|crawling|glacial|sluggish|downtempo|half ?time"), tempo: -14, energy: -0.15 },
  { re: w("very slow|super slow"), tempo: -10 },
  { re: w("fast|faster|quick|speedy|rapid|uptempo|up tempo|racing|hyper|breakneck"), tempo: 14, energy: 0.15 },
  { re: w("very fast|super fast|double time"), tempo: 10 },
  { re: w("driving|pounding|propulsive|relentless|marching|stomping|galloping"), tempo: 6, dims: { pulse: 20, drumFeel: 10 } },
  { re: w("groove|groovy|bouncy|swing|swingy|shuffle"), dims: { drumFeel: 10 } },
  { re: w("sparse|minimal|stripped|stripped back|bare|quiet|empty"), dims: { drumFeel: -20, pulse: -10 } },
  { re: w("busy|dense|layered|full|thick|wall of sound"), dims: { drumFeel: 15 } },
  { re: w("distorted|distortion|gritty|grit|dirty|fuzzy|fuzz|crunchy|lo ?fi|saturated|overdriven|noisy"), dims: { grit: 25 } },
  { re: w("clean|pristine|crisp|polished|glassy"), dims: { grit: -20 } },
  { re: w("spacious|reverb|reverby|echo|echoes|vast|wide|huge|cavernous|washed"), dims: { space: 25 } },
  { re: w("dry|tight|close|intimate|punchy"), dims: { space: -20 } },
  { re: w("bass heavy|bassy|heavy bass|deep bass|sub|subby|booming|thump|thumping|wobble"), dims: { bass: 25 } },
  { re: w("no bass|light bass|thin"), dims: { bass: -25 } },
  { re: w("pulse|pulsing|throbbing|heartbeat"), dims: { pulse: 15 } },
];

/** Instruments. */
const INST_LEX: LexEntry[] = [
  { re: w("banjo|banjos"), genres: { folk: 0.5, countryRock: 0.4 }, lead: "banjo" },
  { re: /\b(distorted|heavy|dirty|fuzzy|fuzz|crunchy|overdriven|loud|electric|metal) guitars?\b|\bpower chords?\b|\briffs?\b|\bshredding\b/g, genres: { rock: 0.5, countryRock: 0.15 }, harmony: "distGuitar", lead: "distGuitar", dims: { grit: 15 } },
  { re: /\bacoustic guitars?\b|\bstrumm(ing|ed)\b|\bfingerpick(ing|ed)\b/g, genres: { folk: 0.3, countryRock: 0.3, rock: 0.1 }, harmony: "strumGuitar" },
  { re: /(?<!(acoustic|distorted|heavy|dirty|fuzzy|fuzz|crunchy|overdriven|loud|electric|metal|lead|slide|steel) )\bguitars?\b/g, genres: { folk: 0.2, countryRock: 0.25, rock: 0.25, blues: 0.1 } },
  { re: w("electric guitar|lead guitar|guitar solo|shred|shredding|slide guitar|steel guitar|pedal steel"), genres: { rock: 0.4, countryRock: 0.3, blues: 0.3 }, lead: "distGuitar" },
  { re: w("twangy|twang|telecaster|chicken pickin"), genres: { countryRock: 0.5 }, lead: "guitar" },
  { re: w("fiddle|violin|violins|cello|viola"), genres: { folk: 0.3, cinematic: 0.4, countryRock: 0.2 }, lead: "strings" },
  { re: w("strings|string section|orchestra|orchestral"), genres: { cinematic: 0.5 }, harmony: "strings" },
  { re: w("piano|keys|grand piano|ivory"), genres: { lofi: 0.2, jazz: 0.2, cinematic: 0.2 }, harmony: "piano" },
  { re: w("rhodes|wurlitzer|electric piano|e piano|epiano"), genres: { lofi: 0.4, jazz: 0.2, house: 0.2 }, harmony: "epiano" },
  { re: w("organ|hammond|church organ"), genres: { blues: 0.3, rock: 0.1 }, harmony: "organ" },
  { re: w("harmonica|blues harp|mouth harp"), genres: { blues: 0.4, folk: 0.3, countryRock: 0.2 }, lead: "harmonica" },
  { re: w("flute|flutes|pan ?flute|recorder"), genres: { folk: 0.2, ambient: 0.2, trap: 0.1 }, lead: "flute" },
  { re: w("whistle|whistling|tin whistle"), genres: { folk: 0.4 }, lead: "whistle" },
  { re: w("bells?|chimes?|glockenspiel|music box|celesta|kalimba"), genres: { ambient: 0.3, lofi: 0.2 }, lead: "bell" },
  { re: w("brass|horns?|trumpet|trumpets|trombone|sax|saxophone"), genres: { jazz: 0.4, cinematic: 0.3 }, lead: "brass" },
  { re: w("choir|choral|chant|chanting|voices"), genres: { cinematic: 0.3, ambient: 0.3 }, harmony: "choir" },
  { re: w("vocal|vocals|voice|singing|singer|vox|humming|ooh|aah"), lead: "voice", dims: { vocalCharacter: 20 } },
  { re: w("supersaw|supersaws|hoover"), genres: { trance: 0.5 }, harmony: "supersaw" },
  { re: w("arp|arps|arpeggio|arpeggios|arpeggiated|sequence|sequenced"), harmony: "pluckArp" },
  { re: w("pad|pads|lush pads"), harmony: "pad" },
  { re: w("acid|303|tb 303|squelch|squelchy"), genres: { techno: 0.5 }, lead: "acidLead", bass: "acid" },
  { re: w("808|808s|eight oh eight"), genres: { trap: 0.6 }, bass: "808", kit: "808" },
  { re: w("upright bass|double bass|stand up bass|walking bass"), genres: { jazz: 0.3, blues: 0.3 }, bass: "upright" },
  { re: w("reese|neuro|wobble bass"), genres: { dnb: 0.4 }, bass: "reese" },
  { re: w("synth bass|bassline|moog"), genres: { synthwave: 0.2, house: 0.2 }, bass: "saw" },
  { re: w("taiko|war drums|toms|timpani|percussion"), genres: { cinematic: 0.4 }, kit: "cinematic" },
  { re: w("brushes|brush|shaker|tambourine"), kit: "brush" },
  { re: w("vinyl|crackle|dusty|tape|cassette|warped|wobbly"), textures: ["vinyl", "tape"], dims: { grit: 10 } },
  { re: w("drums|drum|beat|beats|percussive"), dims: { drumFeel: 10 } },
];

const ROLE_WORDS: { re: RegExp; roles: ("drums" | "bass" | "harmony" | "lead")[] }[] = [
  { re: /^(pulse|beat|beats|drums|groove|rhythm|kick|drive|thump|backbeat|percussion)$/, roles: ["drums", "bass"] },
  { re: /^(bass|bassline|low end|sub)$/, roles: ["bass"] },
  { re: /^(melody|melodies|lead|hook|solo|topline|vocal|vocals)$/, roles: ["lead"] },
  { re: /^(chords|harmony|pads|keys|progression)$/, roles: ["harmony"] },
];

export type Roles = Partial<Record<"drums" | "bass" | "harmony" | "lead", GenreId>>;

export type ParseResult = {
  text: string;
  hash: number;
  genreScores: Partial<Record<GenreId, number>>;
  moods: MoodId[];
  roles: Roles;
  tempoDelta: number;
  energyDelta: number;
  bpmExplicit?: number;
  keyExplicit?: { root: number; mode?: ModeId };
  dims: Partial<Dimensions>;
  instruments: { lead?: LeadInst; harmony?: HarmonyInst; bass?: BassTimbre; kit?: DrumKit };
  textures: TextureId[];
  heard: string[];
  fallback: boolean;
  style: StyleOverrides;
  modeExplicit?: ModeId;
};

const NOTE_PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[-_/]/g, " ")
    .replace(/[^a-z0-9#&\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePrompt(raw: string): ParseResult {
  const hash = hashString(normalize(raw) || "silence");
  const sp = parseStyle(raw, hash);
  const text = normalize(sp.stripped);
  const res: ParseResult = {
    text: raw,
    hash,
    genreScores: {},
    moods: [],
    roles: {},
    tempoDelta: 0,
    energyDelta: 0,
    dims: {},
    instruments: {},
    textures: [],
    heard: [],
    fallback: false,
    style: sp.style,
    modeExplicit: sp.mode,
  };
  const addDims = (d?: Partial<Dimensions>) => {
    if (!d) return;
    for (const [k, v] of Object.entries(d)) {
      const key = k as keyof Dimensions;
      res.dims[key] = (res.dims[key] ?? 0) + (v as number);
    }
  };
  // Track genre mention positions to weight earlier/primary words and find role phrases.
  const genreHits: { genre: GenreId; index: number; end: number; weight: number }[] = [];

  // Explicit tempo/key
  const bpm = text.match(/\b(\d{2,3})\s*(?:bpm|beats per minute)\b/);
  if (bpm) {
    res.bpmExplicit = Math.max(50, Math.min(190, Number(bpm[1])));
    res.heard.push(`${res.bpmExplicit} bpm`);
  }
  const key = raw.toLowerCase().match(/\b(?:in |key of )([a-g])\s*(#|♯|sharp|b|♭|flat)?\s*(major|minor|maj|min|m)?\b/);
  if (key && (key[0].startsWith("in ") ? key[3] || key[2] : true)) {
    let pc = NOTE_PC[key[1]];
    if (key[2] && /#|♯|sharp/.test(key[2])) pc += 1;
    if (key[2] && /^(b|♭|flat)$/.test(key[2])) pc -= 1;
    const mode: ModeId | undefined = key[3] ? (/^(minor|min|m)$/.test(key[3]) ? "aeolian" : "ionian") : undefined;
    res.keyExplicit = { root: (pc + 12) % 12, mode };
    res.heard.push(key[0].replace(/^in /, "").trim());
  }

  const scan = (lex: LexEntry[], genreMult: number) => {
    for (const e of lex) {
      e.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = e.re.exec(text))) {
        const word = m[0];
        if (!res.heard.includes(word)) res.heard.push(word);
        if (e.genres) {
          for (const [g, v] of Object.entries(e.genres)) {
            const gid = g as GenreId;
            const pos = 1 + 0.35 * (1 - m.index / Math.max(1, text.length)); // earlier = a bit stronger
            const val = (v as number) * genreMult * pos;
            res.genreScores[gid] = (res.genreScores[gid] ?? 0) + val;
            genreHits.push({ genre: gid, index: m.index, end: m.index + word.length, weight: val });
          }
        }
        e.moods?.forEach((md) => !res.moods.includes(md) && res.moods.push(md));
        addDims(e.dims);
        if (e.tempo) res.tempoDelta += e.tempo;
        if (e.energy) res.energyDelta += e.energy;
        if (e.lead) res.instruments.lead = e.lead;
        if (e.harmony) res.instruments.harmony = e.harmony;
        if (e.bass) res.instruments.bass = e.bass;
        if (e.kit) res.instruments.kit = e.kit;
        e.textures?.forEach((t) => !res.textures.includes(t) && res.textures.push(t));
      }
    }
  };
  scan(GENRE_LEX, 1);
  scan(SCENE_LEX, 0.7);
  scan(MOOD_LEX, 1);
  scan(TEMPO_LEX, 1);
  scan(INST_LEX, 0.8);

  for (const h of sp.heard) if (!res.heard.includes(h)) res.heard.push(h);

  // "country rock" shouldn't also count as plain "rock" as strongly
  if (/country rock|southern rock/.test(text) && res.genreScores.rock) res.genreScores.rock *= 0.3;

  // Role phrases: "<genre words> pulse", "with a trance beat", "folk melody"
  const tokens = [...text.matchAll(/[a-z0-9&#]+/g)];
  const roleGenres = new Set<GenreId>();
  for (const tok of tokens) {
    const role = ROLE_WORDS.find((r) => r.re.test(tok[0]));
    if (!role) continue;
    // nearest genre hit ending just before this token (within ~2 words)
    const before = genreHits
      .filter((h) => h.end <= tok.index! && tok.index! - h.end <= 14 && GENRES[h.genre].family !== undefined)
      .sort((a, b) => b.end - a.end || b.weight - a.weight)[0];
    if (before) {
      for (const r of role.roles) res.roles[r] = before.genre;
      roleGenres.add(before.genre);
    }
  }

  // A genre named only as a flavor ("...with a trance pulse") supports the main genre rather than leading.
  const named = Object.keys(res.genreScores).filter((g) => (res.genreScores[g as GenreId] ?? 0) > 0.3);
  if (named.length > 1) for (const g of roleGenres) res.genreScores[g] = (res.genreScores[g] ?? 0) * 0.6;

  // Moods imply soft genre leanings when nothing else is there
  const hasGenre = Object.values(res.genreScores).some((v) => (v ?? 0) > 0.25);
  if (!hasGenre) {
    const rng = makeRng(hash);
    const moodGenre: Partial<Record<MoodId, GenreId[]>> = {
      dark: ["techno", "trap", "cinematic"],
      happy: ["house", "folk", "countryRock"],
      lonely: ["folk", "lofi", "ambient"],
      dreamy: ["ambient", "synthwave", "lofi"],
      aggressive: ["rock", "trap", "techno"],
      chill: ["lofi", "ambient", "house"],
      epic: ["cinematic", "trance"],
      romantic: ["jazz", "lofi", "synthwave"],
      mysterious: ["ambient", "cinematic", "synthwave"],
      nostalgic: ["synthwave", "folk", "lofi"],
      hopeful: ["folk", "trance", "cinematic"],
      energetic: ["house", "dnb", "rock", "trance"],
      eerie: ["ambient", "cinematic"],
      warm: ["folk", "lofi", "jazz"],
    };
    if (res.moods.length) {
      for (const md of res.moods) {
        const opts = moodGenre[md] ?? [];
        if (opts.length) {
          const g = rng.pick(opts);
          res.genreScores[g] = (res.genreScores[g] ?? 0) + 0.6;
        }
      }
    }
    if (!Object.values(res.genreScores).some((v) => (v ?? 0) > 0)) {
      // Nothing recognizable: still make something distinct from the words themselves.
      res.fallback = true;
      const g1 = GENRE_IDS[hash % GENRE_IDS.length];
      let g2 = GENRE_IDS[(hash >>> 8) % GENRE_IDS.length];
      if (g2 === g1) g2 = GENRE_IDS[(GENRE_IDS.indexOf(g1) + 5) % GENRE_IDS.length];
      res.genreScores[g1] = 1;
      res.genreScores[g2] = 0.45;
      if (!res.moods.length) res.moods.push(MOOD_IDS[(hash >>> 16) % MOOD_IDS.length]);
    }
  }
  return res;
}

/* ---------------- Plan: the editable "what I understood" ---------------- */

export type Plan = {
  genres: { id: GenreId; weight: number }[];
  moods: MoodId[];
  bpm: number;
  root: number;
  mode: ModeId;
  energy: number;
  roles: Roles;
  instruments: ParseResult["instruments"];
  textures: TextureId[];
  heard: string[];
  fallback: boolean;
  seed: number;
  style: StyleOverrides;
};

export type PlanEdits = {
  genres?: { id: GenreId; weight: number }[];
  moods?: MoodId[];
  bpm?: number;
  root?: number;
  mode?: ModeId;
  instruments?: ParseResult["instruments"];
  style?: StyleOverrides;
};

export function topGenres(scores: Partial<Record<GenreId, number>>): { id: GenreId; weight: number }[] {
  const arr = (Object.entries(scores) as [GenreId, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!arr.length) return [{ id: "lofi", weight: 1 }];
  const top = arr[0][1];
  const kept = arr.filter(([, v]) => v >= top * 0.3).slice(0, 3);
  const sum = kept.reduce((s, [, v]) => s + v, 0);
  return kept.map(([id, v]) => ({ id, weight: Math.round((v / sum) * 100) / 100 }));
}

export function resolvePlan(p: ParseResult, edits: PlanEdits = {}): Plan {
  const rng = makeRng(p.hash);
  const style = mergeOverrides(p.style, edits.style);
  let genres = edits.genres && edits.genres.length ? normalizeWeights(edits.genres) : topGenres(p.genreScores);
  // a prompt-level "go wild" fusion brings its EDM partner into the blend
  if (style.edm && !edits.genres && !genres.some((g) => g.id === EDM[style.edm!].genre)) {
    genres = normalizeWeights([...genres.slice(0, 2), { id: EDM[style.edm].genre, weight: 0.45 }]);
  }
  const primary = GENRES[genres[0].id];
  const moods = edits.moods ?? p.moods.slice(0, 3);

  // Tempo: weighted blend of genre ranges, positioned by a prompt-seeded value + words + moods.
  let lo = 0;
  let hi = 0;
  for (const g of genres) {
    lo += GENRES[g.id].tempo[0] * g.weight;
    hi += GENRES[g.id].tempo[1] * g.weight;
  }
  // Blends between very different tempos lean to the primary genre's range
  if (genres.length > 1) {
    lo = lo * 0.5 + primary.tempo[0] * 0.5;
    hi = hi * 0.5 + primary.tempo[1] * 0.5;
  }
  const moodTempo = moods.reduce((s, m) => s + MOODS[m].tempo, 0) * 0.6;
  let bpm = lo + rng() * (hi - lo) + p.tempoDelta + moodTempo;
  const slack = Math.abs(p.tempoDelta) >= 14 ? 18 : 8; // explicit "fast"/"slow" may leave the genre range
  bpm = Math.max(lo - slack, Math.min(hi + slack, bpm));
  if (style.wild && style.edm && !p.bpmExplicit) {
    const [a, b] = EDM[style.edm].bpm;
    bpm = a + rng() * (b - a);
  }
  bpm = Math.round(Math.max(55, Math.min(180, p.bpmExplicit ?? bpm)));
  if (edits.bpm) bpm = edits.bpm;

  // Mode: primary profile preference + mood boosts
  const modeWeights: Partial<Record<ModeId, number>> = {};
  for (const g of genres) for (const [m, wt] of GENRES[g.id].modes) modeWeights[m] = (modeWeights[m] ?? 0) + wt * g.weight;
  for (const md of moods) for (const [m, wt] of Object.entries(MOODS[md].modes)) modeWeights[m as ModeId] = (modeWeights[m as ModeId] ?? 0) + (wt as number) * 2.5;
  let mode = rng.weighted(MODE_IDS.map((m) => [m, modeWeights[m] ?? 0] as const));
  if (p.keyExplicit?.mode) {
    const fam = MODES[p.keyExplicit.mode].family;
    if (MODES[mode].family !== fam) mode = p.keyExplicit.mode;
  }
  if (p.modeExplicit) mode = p.modeExplicit;
  // a named progression brings its home mode unless the mode was set explicitly
  const np = style.progression && style.progression !== "genre" ? PROGRESSIONS[style.progression] : null;
  if (np && !p.modeExplicit && !edits.mode) {
    if (np.mode) mode = np.mode;
    else if (MODES[mode].family !== np.family) mode = np.family === "major" ? "ionian" : "aeolian";
  }
  if (edits.mode) mode = edits.mode;

  const prefs = primary.rootPrefs;
  let root = prefs ? prefs[rng.int(0, prefs.length - 1)] : rng.int(0, 11);
  if (p.keyExplicit) root = p.keyExplicit.root;
  if (edits.root !== undefined) root = edits.root;

  let energy = 0;
  for (const g of genres) energy += GENRES[g.id].energy * g.weight;
  energy += p.energyDelta + moods.reduce((s, m) => s + MOODS[m].energy, 0);
  energy = Math.max(0.1, Math.min(1, energy));

  const roles: Roles = {};
  const ids = genres.map((g) => g.id);
  for (const [r, g] of Object.entries(p.roles)) if (g && ids.includes(g)) roles[r as keyof Roles] = g;

  return {
    genres,
    moods,
    bpm,
    root,
    mode,
    energy,
    roles,
    instruments: { ...p.instruments, ...(edits.instruments ?? {}) },
    textures: p.textures,
    heard: p.heard,
    fallback: p.fallback,
    seed: p.hash,
    style,
  };
}

function normalizeWeights(gs: { id: GenreId; weight: number }[]) {
  const sum = gs.reduce((s, g) => s + g.weight, 0) || 1;
  return gs.map((g) => ({ id: g.id, weight: g.weight / sum }));
}

/** Suggested nudge positions for a fresh prompt: blend of genre defaults + mood/word hints. */
export function suggestDimensions(plan: Plan, p: ParseResult, base: Dimensions): Dimensions {
  const out: Dimensions = { ...base };
  const keys: (keyof GenreDimsKeys)[] = ["space", "grit", "drumFeel", "pulse", "bass", "genrePull"];
  for (const k of keys) {
    let v = 0;
    for (const g of plan.genres) v += GENRES[g.id].dims[k] * g.weight;
    out[k] = v;
  }
  out.vocalCharacter = 45;
  for (const md of plan.moods) {
    for (const [k, v] of Object.entries(MOODS[md].dims)) out[k as keyof Dimensions] += (v as number) * 0.7;
  }
  for (const [k, v] of Object.entries(p.dims)) out[k as keyof Dimensions] += v as number;
  for (const k of Object.keys(out) as (keyof Dimensions)[]) out[k] = Math.round(Math.max(3, Math.min(95, out[k])));
  return out;
}
type GenreDimsKeys = (typeof GENRES)["house"]["dims"];
