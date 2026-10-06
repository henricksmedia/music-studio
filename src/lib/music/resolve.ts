/**
 * Resolution: Plan + overrides + variation → who plays what (sources & instruments) and the full style spec.
 * Normal mode stays genre-faithful; wild mode (Go wild) samples the whole catalog within coherent bounds.
 */
import {
  GENRES,
  type GenreId,
  type GenreProfile,
  type DrumKit,
  type BassTimbre,
  type BassStyle,
  type HarmonyInst,
  type HarmonyRhythm,
  type LeadInst,
  type MelodyStyle,
  type TextureId,
} from "./genres";
import {
  EDM,
  GEAR,
  LYRIC_THEMES,
  METERS,
  MIXED_CYCLES,
  POLY_RATIOS,
  POLYMETER_CYCLES,
  PROGRESSIONS,
  PROGRESSION_IDS,
  SUBSTYLES,
  TRICK_IDS,
  DEV_IDS,
  type AvoidId,
  type DevId,
  type EdmProfile,
  type FeelId,
  type FormVariant,
  type HookId,
  type MeterId,
  type OpeningId,
  type EndingId,
  type ReverbId,
  type DelayId,
  type StyleOverrides,
  type StyleSpec,
  type TrickId,
} from "./spec";
import { MODES, type ChordColorId } from "./theory";
import type { Rng } from "./rng";
import type { Plan } from "./parse";
import type { Dimensions } from "../types";

export type ComposeDims = Pick<Dimensions, "drumFeel" | "pulse" | "genrePull" | "vocalCharacter">;

export type Sources = { primary: GenreProfile; drums: GenreProfile; bass: GenreProfile; harmony: GenreProfile; lead: GenreProfile };

export type Instruments = {
  kit: DrumKit;
  bassTimbre: BassTimbre;
  bassStyle: BassStyle;
  harmonyInst: HarmonyInst;
  harmonyRhythm: HarmonyRhythm;
  leadInst: LeadInst;
  melodyStyle: MelodyStyle;
  responseInst: LeadInst;
  textures: TextureId[];
};

const ORGANIC_SUB: Partial<Record<HarmonyInst, HarmonyInst>> = { supersaw: "strings", pad: "organ", pluckArp: "cleanGuitar", epiano: "piano" };
const ELECTRO_SUB: Partial<Record<HarmonyInst, HarmonyInst>> = { strumGuitar: "pluckArp", cleanGuitar: "pluckArp", piano: "epiano", organ: "pad", strings: "pad", distGuitar: "supersaw" };
const ORGANIC_LEAD: Partial<Record<LeadInst, LeadInst>> = { sawLead: "guitar", squareLead: "harmonica", acidLead: "distGuitar", fmLead: "flute", pluck: "guitar", epiano: "piano" };
const ELECTRO_LEAD: Partial<Record<LeadInst, LeadInst>> = { banjo: "pluck", guitar: "sawLead", harmonica: "squareLead", flute: "fmLead", whistle: "bell", piano: "epiano", strings: "sawLead", brass: "sawLead" };
const ORGANIC_BASS: Partial<Record<BassTimbre, BassTimbre>> = { saw: "pluck", reese: "upright", acid: "pluck", fm: "upright", "808": "upright", square: "pluck", sub: "upright" };
const ELECTRO_BASS: Partial<Record<BassTimbre, BassTimbre>> = { upright: "sub", pluck: "saw" };
const ORGANIC_KIT: Partial<Record<DrumKit, DrumKit>> = { electronic: "acoustic", "808": "acoustic", gated: "acoustic" };
const ELECTRO_KIT: Partial<Record<DrumKit, DrumKit>> = { acoustic: "electronic", brush: "electronic", lofi: "808" };

export const DEFAULT_RHYTHM: Record<HarmonyInst, HarmonyRhythm> = {
  pad: "sustain",
  supersaw: "pulse8",
  piano: "sustain",
  epiano: "comp",
  organ: "sustain",
  strumGuitar: "strum",
  cleanGuitar: "pick",
  distGuitar: "power",
  pluckArp: "arp",
  strings: "swells",
  brass: "swells",
  choir: "swells",
};

const RESPONSE: Record<LeadInst, LeadInst[]> = {
  sawLead: ["bell", "pluck"],
  squareLead: ["bell", "fmLead"],
  acidLead: ["fmLead", "bell"],
  pluck: ["fmLead", "bell"],
  banjo: ["harmonica", "flute"],
  guitar: ["harmonica", "piano"],
  distGuitar: ["sawLead", "harmonica"],
  bell: ["sawLead", "pluck"],
  flute: ["pluck", "guitar"],
  whistle: ["guitar", "banjo"],
  voice: ["bell", "guitar"],
  piano: ["strings", "guitar"],
  epiano: ["guitar", "bell"],
  strings: ["brass", "flute"],
  brass: ["strings", "flute"],
  harmonica: ["guitar", "piano"],
  fmLead: ["pluck", "bell"],
};

/* ---------------- who provides what ---------------- */

export function pickSources(plan: Plan, rng: Rng): Sources {
  const primary = GENRES[plan.genres[0].id];
  const wild = !!plan.style.wild;
  const pick = (role: "drums" | "bass" | "harmony" | "lead"): GenreProfile => {
    const forced = plan.roles[role];
    if (forced) return GENRES[forced];
    return GENRES[rng.weighted(plan.genres.map((g, i) => [g.id, Math.pow(g.weight, wild ? 0.6 : 1.4) * (i === 0 ? 1.6 : 1)] as const))];
  };
  let drums = pick("drums");
  let bass = plan.roles.bass ? GENRES[plan.roles.bass] : plan.roles.drums ? drums : pick("bass");
  let harmony = pick("harmony");
  let lead = pick("lead");
  const second = plan.genres[1];
  if (second && second.weight >= 0.2) {
    const used = [drums, bass, harmony, lead].map((g) => g.id);
    if (!used.includes(second.id)) {
      const slot = rng.pick(["drums", "lead", "harmony"] as const);
      const g = GENRES[second.id];
      if (slot === "drums") {
        drums = g;
        bass = g;
      } else if (slot === "lead") lead = g;
      else harmony = g;
    }
  }
  if (!plan.roles.harmony && harmony.id !== primary.id && rng.chance(0.5)) harmony = primary;
  // Go wild fusion: the base style keeps the melody most of the time, the EDM partner drives the groove
  if (wild && plan.style.edm && plan.genres.length > 1) {
    const edmG = GENRES[EDM[plan.style.edm].genre];
    if (!plan.roles.drums && rng.chance(0.85)) drums = edmG;
    if (!plan.roles.bass) bass = rng.chance(0.7) ? edmG : primary;
    if (!plan.roles.lead && rng.chance(0.75)) lead = primary;
    if (!plan.roles.harmony) harmony = rng.chance(0.5) ? primary : edmG;
  }
  return { primary, drums, bass, harmony, lead };
}

/* ---------------- instruments ---------------- */

export function pickInstruments(plan: Plan, src: Sources, dims: ComposeDims, rng: Rng): Instruments {
  const edm: EdmProfile | null = plan.style.edm ? EDM[plan.style.edm] : null;
  const fromEdm = (g: GenreProfile) => !!edm && g.id === edm.genre;
  const gp = dims.genrePull;
  const organic = gp < 20;
  const electro = gp > 85;
  const ov = plan.style;

  let kit: DrumKit = fromEdm(src.drums) && edm?.kit ? edm.kit : src.drums.drums.kit;
  if (organic) kit = ORGANIC_KIT[kit] ?? kit;
  if (electro) kit = ELECTRO_KIT[kit] ?? kit;
  if (plan.instruments.kit) kit = plan.instruments.kit;

  let bassTimbre = fromEdm(src.bass) && edm?.bass ? rng.pick(edm.bass) : rng.weighted(src.bass.bass.timbres);
  if (organic) bassTimbre = ORGANIC_BASS[bassTimbre] ?? bassTimbre;
  if (electro) bassTimbre = ELECTRO_BASS[bassTimbre] ?? bassTimbre;
  if (plan.instruments.bass) bassTimbre = plan.instruments.bass;
  let bassStyle = fromEdm(src.bass) && edm?.bassStyle ? edm.bassStyle : rng.weighted(src.bass.bass.styles);
  if (dims.pulse > 72) bassStyle = ({ offbeat: "rolling", root8: "pulse16", sparse: "syncopated", sustain: "root8", rootFifth: "root8" } as Partial<Record<BassStyle, BassStyle>>)[bassStyle] ?? bassStyle;
  if (dims.pulse < 28) bassStyle = ({ rolling: "offbeat", pulse16: "root8", root8: "rootFifth", syncopated: "sparse", walking: "rootFifth" } as Partial<Record<BassStyle, BassStyle>>)[bassStyle] ?? bassStyle;
  if (bassTimbre === "808") bassStyle = "slide808";
  if (ov.bassStyle) bassStyle = ov.bassStyle;

  let harmonyInst = fromEdm(src.harmony) && edm?.harmony ? rng.pick(edm.harmony) : rng.weighted(src.harmony.harmony.insts);
  if (organic) harmonyInst = ORGANIC_SUB[harmonyInst] ?? harmonyInst;
  if (electro) harmonyInst = ELECTRO_SUB[harmonyInst] ?? harmonyInst;
  if (plan.instruments.harmony) harmonyInst = plan.instruments.harmony;
  let harmonyRhythm: HarmonyRhythm = (src.harmony.harmony.rhythms[harmonyInst] as HarmonyRhythm | undefined) ?? DEFAULT_RHYTHM[harmonyInst];
  if (ov.harmonyRhythm) harmonyRhythm = ov.harmonyRhythm;

  let leadInst = fromEdm(src.lead) && edm?.lead ? rng.pick(edm.lead) : rng.weighted(src.lead.lead.insts);
  if (organic) leadInst = ORGANIC_LEAD[leadInst] ?? leadInst;
  if (electro) leadInst = ELECTRO_LEAD[leadInst] ?? leadInst;
  if (!plan.instruments.lead) {
    if (dims.vocalCharacter > 75) leadInst = "voice";
    else if (dims.vocalCharacter < 20) leadInst = gp > 60 ? "whistle" : "flute";
  }
  if (plan.instruments.lead) leadInst = plan.instruments.lead;
  const melodyStyle = ov.melodyStyle ?? src.lead.lead.style;
  const responseInst = rng.pick(RESPONSE[leadInst]);

  const textures = Array.from(
    new Set([...src.primary.textures, ...(plan.genres[1] ? GENRES[plan.genres[1].id].textures.slice(0, 1) : []), ...plan.textures])
  );
  return { kit, bassTimbre, bassStyle, harmonyInst, harmonyRhythm, leadInst, melodyStyle, responseInst, textures };
}

/** Enforce Avoid rules + vocal status on the instrument choice. */
export function applyAvoid(inst: Instruments, avoid: AvoidId[], vocal: StyleSpec["production"]["vocal"], hasLeadLock: boolean): Instruments {
  const a = new Set(avoid);
  const out = { ...inst, textures: [...inst.textures] };
  const noVoice = a.has("choirPads") || a.has("vocals") || vocal === "instrumental";
  if (a.has("supersaws") && out.harmonyInst === "supersaw") {
    out.harmonyInst = "pad";
    out.harmonyRhythm = out.harmonyRhythm === "pulse8" ? "pulse8" : "sustain";
  }
  if ((a.has("choirPads") || a.has("vocals")) && out.harmonyInst === "choir") out.harmonyInst = "pad";
  if (a.has("cheesyPiano")) {
    if (out.harmonyInst === "piano") out.harmonyInst = "epiano";
    if (out.leadInst === "piano") out.leadInst = "bell";
    if (out.responseInst === "piano") out.responseInst = "guitar";
  }
  if (a.has("orchestralSwells")) {
    if (out.harmonyInst === "strings" || out.harmonyInst === "brass") out.harmonyInst = "pad";
    if (out.harmonyRhythm === "swells") out.harmonyRhythm = "sustain";
  }
  if (a.has("808s")) {
    if (out.kit === "808") out.kit = "electronic";
    if (out.bassTimbre === "808") {
      out.bassTimbre = "sub";
      if (out.bassStyle === "slide808") out.bassStyle = "syncopated";
    }
  }
  if (a.has("cinematicBooms")) {
    if (out.kit === "cinematic") out.kit = "acoustic";
    out.textures = out.textures.filter((t) => t !== "impact");
  }
  if (a.has("genericRisers")) out.textures = out.textures.filter((t) => t !== "riser");
  if (noVoice) {
    if (out.leadInst === "voice") out.leadInst = "bell";
    if (out.responseInst === "voice") out.responseInst = "bell";
  } else if (vocal === "synthVoice" && !hasLeadLock) {
    out.leadInst = "voice";
  }
  if (a.has("supersaws") && out.harmonyInst === "supersaw") out.harmonyInst = "pad";
  if (out.responseInst === out.leadInst) out.responseInst = RESPONSE[out.leadInst].find((x) => x !== out.leadInst) ?? "bell";
  if (a.has("cheesyPiano") && out.responseInst === "piano") out.responseInst = "guitar";
  return out;
}

/* ---------------- style spec ---------------- */

const GENRE_TRICKS: Record<GenreId, [TrickId, number][]> = {
  house: [["syncopation", 0.5], ["ostinato", 0.3], ["polymeter", 0.15]],
  techno: [["polymeter", 0.35], ["ostinato", 0.5], ["polyrhythm", 0.2], ["deconstruction", 0.3]],
  synthwave: [["ostinato", 0.5], ["backbeat", 0.7], ["dotted", 0.4]],
  ambient: [["polyrhythm", 0.3], ["layering", 0.25], ["isorhythm", 0.2]],
  trance: [["ostinato", 0.6], ["syncopation", 0.4], ["dotted", 0.3]],
  dnb: [["brokenTime", 0.6], ["syncopation", 0.5], ["glitch", 0.25]],
  folk: [["humanize", 0.8], ["callResponse", 0.3]],
  countryRock: [["backbeat", 0.8], ["humanize", 0.6], ["breaks", 0.3]],
  rock: [["backbeat", 0.9], ["breaks", 0.35], ["humanize", 0.5], ["syncopation", 0.3]],
  blues: [["breaks", 0.5], ["callResponse", 0.6], ["humanize", 0.8], ["triplets", 0.5]],
  lofi: [["humanize", 0.8], ["jitter", 0.4], ["dotted", 0.2]],
  boombap: [["humanize", 0.7], ["syncopation", 0.4], ["breaks", 0.2]],
  trap: [["triplets", 0.8], ["halftime", 0.9], ["glitch", 0.25]],
  cinematic: [["ostinato", 0.5], ["hemiola", 0.25], ["triplets", 0.3], ["polyrhythm", 0.15]],
  jazz: [["callResponse", 0.5], ["displacement", 0.35], ["syncopation", 0.5], ["humanize", 0.8], ["triplets", 0.4]],
};

const GENRE_METERS: Partial<Record<GenreId, [MeterId, number][]>> = {
  folk: [["4/4", 6], ["3/4", 1.5], ["6/8", 1.5]],
  cinematic: [["4/4", 6], ["6/8", 1.5], ["3/4", 1], ["5/4", 0.5]],
  jazz: [["4/4", 6], ["3/4", 1.5], ["5/4", 1]],
  ambient: [["4/4", 6], ["3/4", 1], ["6/8", 1], ["7/8", 0.5]],
  countryRock: [["4/4", 8], ["6/8", 1]],
  rock: [["4/4", 9], ["7/8", 0.5], ["6/8", 0.5]],
  lofi: [["4/4", 9], ["3/4", 0.6]],
};

const HOOK_W: Partial<Record<GenreId, [HookId, number][]>> = {
  house: [["stab", 3], ["bassline", 2], ["riff", 2], ["chords", 2]],
  techno: [["bassline", 3], ["riff", 3], ["rhythm", 2], ["texture", 1]],
  trance: [["riff", 4], ["chords", 2]],
  dnb: [["bassline", 3], ["riff", 2], ["texture", 1]],
  synthwave: [["riff", 3], ["chords", 2], ["bassline", 1]],
  ambient: [["texture", 3], ["chords", 2], ["riff", 1]],
  trap: [["bassline", 3], ["riff", 2], ["texture", 2]],
  cinematic: [["riff", 3], ["chords", 2], ["rhythm", 2]],
  lofi: [["chords", 3], ["texture", 2], ["riff", 1]],
  boombap: [["chords", 2], ["riff", 2], ["bassline", 2]],
  jazz: [["riff", 3], ["chords", 2]],
};
const OPEN_W: Partial<Record<GenreId, [OpeningId, number][]>> = {
  house: [["drumsAlone", 3], ["filteredPads", 2], ["soloBass", 1]],
  techno: [["drumsAlone", 3], ["soloBass", 2], ["distantDrone", 1]],
  trance: [["filteredPads", 3], ["drumsAlone", 2]],
  dnb: [["filteredPads", 2], ["drumsAlone", 2], ["hookFragment", 1]],
  synthwave: [["filteredPads", 3], ["drumsAlone", 1]],
  ambient: [["distantDrone", 3], ["textureBed", 2]],
  cinematic: [["distantDrone", 2], ["filteredPads", 2], ["hookFragment", 2]],
  folk: [["hookFragment", 3], ["textureBed", 1]],
  blues: [["hookFragment", 3], ["soloBass", 1]],
  countryRock: [["hookFragment", 2], ["drumsAlone", 1]],
  rock: [["drumsAlone", 2], ["hookFragment", 2]],
  lofi: [["textureBed", 3], ["filteredPads", 2]],
  boombap: [["textureBed", 2], ["drumsAlone", 2]],
  trap: [["filteredPads", 2], ["hookFragment", 2]],
  jazz: [["soloBass", 2], ["hookFragment", 2]],
};
const END_W: Partial<Record<GenreId, [EndingId, number][]>> = {
  blues: [["ritard", 3], ["finalHit", 2]],
  jazz: [["ritard", 2], ["finalHit", 2]],
  rock: [["finalHit", 3], ["cut", 1], ["ritard", 1]],
  countryRock: [["finalHit", 2], ["ritard", 2]],
  folk: [["ritard", 2], ["fade", 2]],
  ambient: [["fade", 4]],
  cinematic: [["finalHit", 2], ["ritard", 2], ["fade", 1]],
  lofi: [["fade", 2], ["cut", 1]],
  boombap: [["cut", 2], ["fade", 1]],
  trap: [["cut", 2], ["fade", 1]],
  house: [["fade", 2], ["cut", 1]],
  techno: [["fade", 2], ["cut", 1]],
  trance: [["fade", 2], ["finalHit", 1]],
  dnb: [["cut", 2], ["fade", 1]],
  synthwave: [["fade", 2], ["finalHit", 1]],
};
const REVERB_W: Partial<Record<GenreId, [ReverbId, number][]>> = {
  blues: [["spring", 3], ["room", 2]],
  rock: [["room", 2], ["plate", 2], ["spring", 1]],
  countryRock: [["spring", 2], ["plate", 2]],
  folk: [["room", 2], ["plate", 2]],
  ambient: [["shimmer", 3], ["hall", 2]],
  cinematic: [["hall", 4], ["shimmer", 1]],
  lofi: [["room", 2], ["spring", 1]],
  boombap: [["room", 2], ["plate", 1]],
  jazz: [["room", 2], ["plate", 1]],
  synthwave: [["hall", 2], ["plate", 2]],
};
const DELAY_W: Partial<Record<GenreId, [DelayId, number][]>> = {
  blues: [["slap", 3], ["quarter", 1]],
  rock: [["slap", 2], ["dotted8", 1]],
  countryRock: [["slap", 3]],
  folk: [["quarter", 2], ["slap", 1]],
  lofi: [["triplet8", 2], ["quarter", 1]],
  trap: [["triplet8", 2], ["dotted8", 1]],
  jazz: [["quarter", 2], ["slap", 1]],
};

const ELECTRONIC_KITS: DrumKit[] = ["electronic", "808", "gated"];

export function resolveSpec(plan: Plan, src: Sources, inst: Instruments, rng: Rng): StyleSpec {
  const ov: StyleOverrides = plan.style;
  const wild = !!ov.wild;
  const edm = ov.edm ? EDM[ov.edm] : null;
  const g = src.primary.id;
  const dg = src.drums.id;

  /* rhythm */
  const meterOpts: [MeterId, number][] = wild
    ? [["4/4", 50], ["6/8", 10], ["3/4", 6], ["7/8", 14], ["5/4", 10], ["mixed", 10]]
    : (GENRE_METERS[g] ?? [["4/4", 1]]);
  const meter: MeterId = ov.meter ?? rng.weighted(meterOpts);
  let cycle = METERS[meter].steps;
  let meterLabel = METERS[meter].label;
  if (meter === "mixed") {
    const mc = MIXED_CYCLES[ov.mixedCycle ?? rng.int(0, MIXED_CYCLES.length - 1)];
    cycle = mc.steps;
    meterLabel = mc.label;
  }
  const tricksOn = new Set<TrickId>();
  const roll = (id: TrickId, p: number) => {
    if (rng.chance(p)) tricksOn.add(id);
  };
  for (const [id, p] of GENRE_TRICKS[dg]) roll(id, p);
  if (g !== dg) for (const [id, p] of GENRE_TRICKS[g]) roll(id, p * 0.4);
  edm?.tricks?.forEach((t) => tricksOn.add(t));
  if (wild) {
    const pool = TRICK_IDS.filter((t) => !["humanize", "backbeat", "jitter"].includes(t));
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i++) tricksOn.add(rng.pick(pool));
  }
  for (const [id, on] of Object.entries(ov.tricks ?? {}) as [TrickId, boolean][]) {
    if (on) tricksOn.add(id);
    else tricksOn.delete(id);
  }
  // coherence: one subdivision tuplet type, half-time vs backbeat, polymeter/layering pairs
  const tup = (["septuplets", "quintuplets", "triplets"] as TrickId[]).filter((t) => tricksOn.has(t));
  if (tup.length > 1) tup.slice(1).forEach((t) => !ov.tricks?.[t] && tricksOn.delete(t));
  if (tricksOn.has("halftime") && tricksOn.has("backbeat")) {
    if (ov.tricks?.backbeat) tricksOn.delete("halftime");
    else tricksOn.delete("backbeat");
  }
  if (meter !== "4/4" && tricksOn.has("additive") && !ov.tricks?.additive) tricksOn.delete("additive");

  const groupingOpts = METERS[meter].groupings;
  let grouping = ov.grouping ?? groupingOpts[0];
  if (!ov.grouping && meter === "4/4" && tricksOn.has("additive")) grouping = rng.pick(groupingOpts.slice(1));
  if (!ov.grouping && meter !== "4/4" && meter !== "mixed") grouping = rng.pick(groupingOpts);
  if (meter === "4/4" && grouping.join() !== "2,2,2,2") tricksOn.add("additive");

  const genreSwing = edm && src.drums.id === edm.genre && edm.swing !== undefined ? edm.swing : src.drums.swing;
  let feel: FeelId = edm?.feel && src.drums.id === edm.genre ? edm.feel : genreSwing > 0.6 ? "shuffle" : genreSwing > 0.22 ? "swing" : "straight";
  if (wild && !ov.feel && rng.chance(0.3)) feel = rng.pick(["straight", "swing", "shuffle"] as FeelId[]);
  if (ov.feel) feel = ov.feel;
  let swing = feel === "straight" ? 0 : feel === "shuffle" ? Math.max(0.85, genreSwing) : Math.max(0.35, Math.min(0.75, genreSwing || 0.5));
  if (ov.swing !== undefined) swing = ov.swing / 100;
  const organicKit = !ELECTRONIC_KITS.includes(inst.kit);
  let syncopation = Math.min(0.9, 0.15 + src.drums.energy * 0.25 + (tricksOn.has("syncopation") ? 0.4 : 0) + (wild ? rng.range(0, 0.3) : 0));
  if (ov.syncopation !== undefined) syncopation = ov.syncopation / 100;
  if (syncopation > 0.55) tricksOn.add("syncopation");
  let humanize = (organicKit ? 0.45 : 0.08) + (tricksOn.has("humanize") ? 0.3 : 0) + (tricksOn.has("jitter") ? 0.35 : 0);
  if (ov.humanize !== undefined) humanize = ov.humanize / 100;
  humanize = Math.min(1, humanize);
  if (humanize >= 0.5) tricksOn.add("humanize");
  let glitch = tricksOn.has("glitch") ? (wild ? rng.range(0.4, 0.8) : 0.55) : 0;
  if (ov.glitch !== undefined) glitch = ov.glitch / 100;
  if (glitch > 0.2) tricksOn.add("glitch");
  else tricksOn.delete("glitch");
  const polyRatio = ov.polyRatio ?? (meter === "7/8" ? ([5, 7] as [number, number]) : rng.pick(POLY_RATIOS.filter(([a, b]) => b === 4 || b === 2 || wild)));
  const polymeterCycle = ov.polymeterCycle ?? rng.pick(POLYMETER_CYCLES.filter((c) => c * 2 !== cycle[0]));
  const clave = ov.clave ?? (rng.chance(0.5) ? "3-2" : "2-3");

  /* harmony */
  const fam = MODES[plan.mode].family;
  let progression: StyleSpec["harmony"]["progression"] = "genre";
  if (wild && rng.chance(0.6)) {
    const ok = PROGRESSION_IDS.filter((p) => PROGRESSIONS[p].family === fam && (!PROGRESSIONS[p].mode || PROGRESSIONS[p].mode === plan.mode));
    if (ok.length) progression = rng.pick(ok);
  }
  if (ov.progression) progression = ov.progression;
  const colors: ChordColorId[] = ["auto", "plain", "sus", "sevenths", "rich", "power", "diminished", "augmented"];
  let chordColor: ChordColorId = wild && rng.chance(0.55) ? rng.pick(colors.slice(1)) : "auto";
  if (wild && chordColor === "power" && !["rock", "countryRock", "blues", "dnb", "techno"].includes(g)) chordColor = "plain";
  if (ov.chordColor) chordColor = ov.chordColor;
  const ht = ov.harmonyTricks ?? {};
  const pedalP = wild ? 0.3 : ({ techno: 0.35, ambient: 0.4, cinematic: 0.3, trance: 0.2 } as Partial<Record<GenreId, number>>)[g] ?? 0.06;
  const droneP = wild ? 0.35 : ({ ambient: 0.6, techno: 0.3, cinematic: 0.35 } as Partial<Record<GenreId, number>>)[g] ?? 0.05;
  const borrowedP = wild ? 0.45 : ({ cinematic: 0.35, synthwave: 0.3, rock: 0.2, folk: 0.15 } as Partial<Record<GenreId, number>>)[g] ?? 0.1;
  const chromaticP = wild ? 0.35 : ({ jazz: 0.6, blues: 0.5, lofi: 0.3 } as Partial<Record<GenreId, number>>)[g] ?? 0.08;
  const harmony = {
    chordColor,
    progression,
    pedal: ht.pedal ?? rng.chance(pedalP),
    drone: ht.drone ?? (inst.textures.includes("drone") || rng.chance(droneP)),
    borrowed: ht.borrowed ?? rng.chance(borrowedP),
    chromatic: ht.chromatic ?? rng.chance(chromaticP),
  };

  /* production */
  const hook: HookId = ov.hook ?? (wild ? rng.pick(["riff", "bassline", "chords", "stab", "rhythm", "texture"] as HookId[]) : rng.weighted(HOOK_W[g] ?? [["riff", 1]]));
  const opening: OpeningId =
    ov.opening ?? (wild ? rng.pick(["filteredPads", "soloBass", "distantDrone", "hookFragment", "drumsAlone", "textureBed"] as OpeningId[]) : rng.weighted(OPEN_W[g] ?? [["filteredPads", 1]]));
  const ending: EndingId = ov.ending ?? (wild ? rng.pick(["ritard", "finalHit", "fade", "cut"] as EndingId[]) : rng.weighted(END_W[g] ?? [["fade", 1], ["finalHit", 1]]));
  const vocal = ov.vocal ?? (inst.leadInst === "voice" || (wild && rng.chance(0.25)) ? "synthVoice" : "instrumental");
  const electronic = src.primary.family === "electronic" || src.drums.family === "electronic";
  const reverb: ReverbId = ov.reverb ?? (edm?.reverb && rng.chance(0.7) ? edm.reverb : wild ? rng.pick(["room", "plate", "hall", "spring", "shimmer"] as ReverbId[]) : rng.weighted(REVERB_W[g] ?? [["plate", 2], ["hall", 2]]));
  const delay: DelayId = ov.delay ?? (edm?.delay ?? (wild ? rng.pick(["dotted8", "quarter", "triplet8", "slap"] as DelayId[]) : rng.weighted(DELAY_W[g] ?? [["dotted8", 2], ["quarter", 1]])));
  const pump = ov.pump ?? (edm?.pump || (electronic && ["house", "trance", "synthwave"].includes(dg) && rng.chance(0.5)) || (wild && electronic && rng.chance(0.35)));
  const crush = ov.crush ?? ((g === "lofi" && rng.chance(0.4)) || (tricksOn.has("glitch") && rng.chance(0.4)) || (wild && rng.chance(0.15)));
  const tape = ov.tape ?? ((["lofi", "boombap", "synthwave"].includes(g) && rng.chance(0.5)) || (g === "blues" && rng.chance(0.3)) || (wild && rng.chance(0.3)));
  const devOn = new Set<DevId>(["filter", "percRise"]);
  if (electronic || wild) devOn.add("dropouts");
  if (rng.chance(0.6)) devOn.add("widening");
  if (src.primary.energy > 0.6 || wild) devOn.add("saturation");
  if (tricksOn.has("glitch")) devOn.add("edits");
  if (wild) for (const d of DEV_IDS) if (rng.chance(0.25)) devOn.add(d);
  for (const [d, on] of Object.entries(ov.development ?? {}) as [DevId, boolean][]) {
    if (on) devOn.add(d);
    else devOn.delete(d);
  }
  const contrast = ov.contrast ?? devOn.has("widening");
  if (contrast) devOn.add("widening");
  const mix = {
    pads: ov.pads ?? (["folk", "blues", "rock", "boombap"].includes(g) && !wild ? "narrow" : "wide"),
    drums: ov.drumsRoom ?? (["lofi", "boombap", "rock", "blues", "folk", "trap", "house", "techno"].includes(dg) ? "dry" : "roomy"),
    contrast,
  } as StyleSpec["production"]["mix"];
  const form: FormVariant =
    ov.form ?? (wild ? rng.weighted([["classic", 5], ["slowBurn", 2], ["hookFirst", 2]] as [FormVariant, number][]) : ["ambient", "cinematic"].includes(g) && rng.chance(0.3) ? "slowBurn" : "classic");
  const avoid = ov.avoid ?? [];

  // substyle naming
  let baseSub = SUBSTYLES[g][0];
  const heard = plan.heard.join(" ").toLowerCase();
  const named = SUBSTYLES[g].find((s) => heard.includes(s.split(" ")[0].toLowerCase()));
  if (named) baseSub = named;
  else if (plan.moods.includes("dark")) baseSub = SUBSTYLES[g].find((s) => /dark/i.test(s)) ?? rng.pick(SUBSTYLES[g]);
  else baseSub = rng.pick(SUBSTYLES[g]);
  let substyle = ov.substyle ?? baseSub;
  if (!ov.substyle) {
    if (edm) substyle = `${baseSub} × ${edm.label}`;
    else if (plan.genres[1]) substyle = `${baseSub} × ${GENRES[plan.genres[1].id].label}`;
  }

  return {
    rhythm: {
      meter,
      cycle,
      meterLabel,
      grouping,
      feel,
      swing,
      syncopation,
      humanize,
      glitch,
      tricks: TRICK_IDS.filter((t) => tricksOn.has(t)),
      polyRatio,
      polymeterCycle,
      clave,
    },
    harmony,
    production: {
      hook,
      opening,
      ending,
      vocal,
      mix,
      avoid,
      fx: { reverb, delay, pump: !!pump, crush: !!crush, tape: !!tape },
      development: DEV_IDS.filter((d) => devOn.has(d)),
      form,
      edm: ov.edm,
      substyle,
      gear: [],
      lyricTheme: ov.lyricTheme ?? rng.pick(LYRIC_THEMES),
      wild,
    },
  };
}

/** 2–5 real gear names matching the actual sound choices (flavor/inspiration only). */
export function pickGear(inst: Instruments, spec: StyleSpec, rng: Rng): string[] {
  if (spec.production.gear.length) return spec.production.gear;
  const want: [string, string][] = [
    ["kit", inst.kit],
    ["bass", inst.bassTimbre],
    ["harmony", inst.harmonyInst],
    ["lead", inst.leadInst],
    ["fx", spec.production.fx.tape ? "tape" : spec.production.fx.reverb],
  ];
  if (spec.rhythm.tricks.includes("glitch")) want.push(["fx", "glitch"]);
  if (spec.production.fx.delay === "dotted8") want.push(["fx", "dotted8"]);
  const out: string[] = [];
  const edm = spec.production.edm ? EDM[spec.production.edm] : null;
  if (edm && rng.chance(0.6)) out.push(rng.pick(edm.gear));
  for (const [role, value] of want) {
    const opts = GEAR.filter((x) => x.role === role && x.value === value && !out.includes(x.name));
    if (opts.length) out.push(rng.pick(opts).name);
  }
  return Array.from(new Set(out)).slice(0, 5);
}
