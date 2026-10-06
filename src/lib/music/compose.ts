/**
 * Composer: Plan + dimensions + variation → a fully arranged Song (pure data, no audio).
 * Deterministic: same inputs → same song. Used by realtime playback and offline export alike.
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
  type DrumPattern,
  type Form,
} from "./genres";
import { MODES, parseRoman, voiceChord, snapToSet, chordPitchClasses, type Chord, type ModeId } from "./theory";
import { makeRng, type Rng } from "./rng";
import type { Plan } from "./parse";
import type { Dimensions } from "../types";

export type StemId = "drums" | "bass" | "harmony" | "lead" | "texture";
export const STEM_IDS: StemId[] = ["drums", "bass", "harmony", "lead", "texture"];

export type NoteEvent = {
  stem: StemId;
  inst: string;
  t: number; // beats from song start
  dur: number; // beats
  midi: number;
  vel: number; // 0..1
  kit?: DrumKit;
  glide?: number; // semitones to bend toward by note end
  variant?: number; // instrument-specific (strum direction, muted, vowel...)
  notes?: number[]; // chord voicings (strums)
};

export type SectionType = "intro" | "verse" | "build" | "chorus" | "drop" | "breakdown" | "bridge" | "solo" | "outro";

export type Section = { type: SectionType; label: string; startBar: number; bars: number; intensity: number };

export type Arrangement = {
  drumsFrom: GenreId;
  bassFrom: GenreId;
  harmonyFrom: GenreId;
  leadFrom: GenreId;
  kit: DrumKit;
  bassTimbre: BassTimbre;
  bassStyle: BassStyle;
  harmonyInst: HarmonyInst;
  harmonyRhythm: HarmonyRhythm;
  leadInst: LeadInst;
  melodyStyle: MelodyStyle;
  textures: TextureId[];
  form: Form;
  swing: number;
};

export type Song = {
  bpm: number;
  totalBeats: number;
  durationSec: number;
  sections: Section[];
  barChords: string[];
  events: NoteEvent[];
  keyRoot: number;
  mode: ModeId;
  arrangement: Arrangement;
  variation: number;
};

type ComposeDims = Pick<Dimensions, "drumFeel" | "pulse" | "genrePull" | "vocalCharacter">;

/* ---------------- helpers ---------------- */

const SECTION_INTENSITY: Record<SectionType, number> = {
  intro: 0.35,
  verse: 0.6,
  build: 0.7,
  chorus: 0.95,
  drop: 1,
  breakdown: 0.3,
  bridge: 0.55,
  solo: 0.9,
  outro: 0.35,
};

type LayerLevels = { drums: number; bass: number; harmony: number; lead: number; texture: number };
const LAYERS: Record<SectionType, LayerLevels> = {
  intro: { drums: 0.3, bass: 0, harmony: 0.8, lead: 0, texture: 1 },
  verse: { drums: 0.75, bass: 0.85, harmony: 0.7, lead: 0.75, texture: 0.5 },
  build: { drums: 0.8, bass: 0.6, harmony: 0.8, lead: 0.4, texture: 1 },
  chorus: { drums: 1, bass: 1, harmony: 1, lead: 1, texture: 0.7 },
  drop: { drums: 1, bass: 1, harmony: 1, lead: 1, texture: 0.7 },
  breakdown: { drums: 0, bass: 0.45, harmony: 1, lead: 0.6, texture: 1 },
  bridge: { drums: 0.55, bass: 0.75, harmony: 0.85, lead: 0.65, texture: 0.6 },
  solo: { drums: 0.9, bass: 0.9, harmony: 0.75, lead: 1, texture: 0.5 },
  outro: { drums: 0.35, bass: 0.5, harmony: 0.75, lead: 0.3, texture: 1 },
};

const TEMPLATES: Record<Exclude<Form, "blues">, [SectionType, number, number][]> = {
  // [type, bars, dropPriority (higher drops first, 0 = keep)]
  edm: [["intro", 4, 0], ["build", 4, 3], ["drop", 8, 0], ["breakdown", 8, 2], ["build", 4, 4], ["drop", 8, 0], ["outro", 4, 1]],
  song: [["intro", 4, 0], ["verse", 8, 0], ["chorus", 8, 0], ["verse", 8, 4], ["chorus", 8, 4], ["bridge", 4, 2], ["chorus", 8, 0], ["outro", 4, 1]],
  ambient: [["intro", 4, 0], ["verse", 8, 0], ["chorus", 8, 4], ["breakdown", 8, 2], ["chorus", 8, 0], ["outro", 4, 1]],
  cinematic: [["intro", 4, 0], ["verse", 8, 0], ["build", 4, 2], ["chorus", 8, 4], ["breakdown", 4, 4], ["chorus", 8, 0], ["outro", 4, 1]],
};

const LABELS: Record<SectionType, string> = {
  intro: "Intro",
  verse: "Verse",
  build: "Build",
  chorus: "Chorus",
  drop: "Drop",
  breakdown: "Breakdown",
  bridge: "Bridge",
  solo: "Solo",
  outro: "Outro",
};

function swingBeat(step: number, swing: number, grid: 8 | 16): number {
  const beat = Math.floor(step / 4);
  const pos = ((step % 4) + 4) % 4;
  if (grid === 16) return step * 0.25 + (step % 2 === 1 ? swing / 12 : 0);
  const map = [0, 0.25 + swing / 12, 0.5 + swing / 6, 0.75 + swing / 12];
  return beat + map[pos];
}

const ORGANIC_SUB: Partial<Record<HarmonyInst, HarmonyInst>> = { supersaw: "strings", pad: "organ", pluckArp: "cleanGuitar", epiano: "piano" };
const ELECTRO_SUB: Partial<Record<HarmonyInst, HarmonyInst>> = { strumGuitar: "pluckArp", cleanGuitar: "pluckArp", piano: "epiano", organ: "pad", strings: "pad", distGuitar: "supersaw" };
const ORGANIC_LEAD: Partial<Record<LeadInst, LeadInst>> = { sawLead: "guitar", squareLead: "harmonica", acidLead: "distGuitar", fmLead: "flute", pluck: "guitar", epiano: "piano" };
const ELECTRO_LEAD: Partial<Record<LeadInst, LeadInst>> = { banjo: "pluck", guitar: "sawLead", harmonica: "squareLead", flute: "fmLead", whistle: "bell", piano: "epiano", strings: "sawLead", brass: "sawLead" };
const ORGANIC_BASS: Partial<Record<BassTimbre, BassTimbre>> = { saw: "pluck", reese: "upright", acid: "pluck", fm: "upright", "808": "upright", square: "pluck", sub: "upright" };
const ELECTRO_BASS: Partial<Record<BassTimbre, BassTimbre>> = { upright: "sub", pluck: "saw" };
const ORGANIC_KIT: Partial<Record<DrumKit, DrumKit>> = { electronic: "acoustic", "808": "acoustic", gated: "acoustic" };
const ELECTRO_KIT: Partial<Record<DrumKit, DrumKit>> = { acoustic: "electronic", brush: "electronic", lofi: "808" };

const DEFAULT_RHYTHM: Record<HarmonyInst, HarmonyRhythm> = {
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

const LEAD_CENTER: Record<LeadInst, number> = {
  sawLead: 72,
  squareLead: 72,
  acidLead: 52,
  pluck: 74,
  banjo: 74,
  guitar: 66,
  distGuitar: 66,
  bell: 81,
  flute: 77,
  whistle: 81,
  voice: 67,
  piano: 72,
  epiano: 70,
  strings: 72,
  brass: 65,
  harmonica: 69,
  fmLead: 72,
};

/* ---------------- main ---------------- */

export function compose(plan: Plan, dims: ComposeDims, variation = 0): Song {
  const rng = makeRng(plan.seed ^ Math.imul(variation + 1, 0x9e3779b1));
  const primary = GENRES[plan.genres[0].id];
  const keyRoot = plan.root;
  const mode = plan.mode;
  const family = MODES[mode].family;
  const bpm = plan.bpm;
  const beatSec = 60 / bpm;
  const barSec = beatSec * 4;

  /* --- who provides what (genre blending) --- */
  const pickSource = (role: "drums" | "bass" | "harmony" | "lead", r: Rng): GenreProfile => {
    const forced = plan.roles[role];
    if (forced) return GENRES[forced];
    return GENRES[r.weighted(plan.genres.map((g, i) => [g.id, Math.pow(g.weight, 1.4) * (i === 0 ? 1.6 : 1)] as const))];
  };
  const srcRng = rng.fork("sources");
  let drumsSrc = pickSource("drums", srcRng);
  let bassSrc = plan.roles.bass ? GENRES[plan.roles.bass] : plan.roles.drums ? drumsSrc : pickSource("bass", srcRng);
  let harmonySrc = pickSource("harmony", srcRng);
  let leadSrc = pickSource("lead", srcRng);
  // make sure a meaningful secondary genre is audible somewhere
  const second = plan.genres[1];
  if (second && second.weight >= 0.2) {
    const used = [drumsSrc, bassSrc, harmonySrc, leadSrc].map((g) => g.id);
    if (!used.includes(second.id)) {
      const slot = srcRng.pick(["drums", "lead", "harmony"] as const);
      const g = GENRES[second.id];
      if (slot === "drums") {
        drumsSrc = g;
        bassSrc = g;
      } else if (slot === "lead") leadSrc = g;
      else harmonySrc = g;
    }
  }
  if (!plan.roles.harmony && harmonySrc.id !== primary.id && rng.chance(0.5)) harmonySrc = primary;

  const gp = dims.genrePull;
  const organic = gp < 20;
  const electro = gp > 85;

  let kit: DrumKit = drumsSrc.drums.kit;
  if (organic) kit = ORGANIC_KIT[kit] ?? kit;
  if (electro) kit = ELECTRO_KIT[kit] ?? kit;
  if (plan.instruments.kit) kit = plan.instruments.kit;

  const instRng = rng.fork("inst");
  let bassTimbre = instRng.weighted(bassSrc.bass.timbres);
  if (organic) bassTimbre = ORGANIC_BASS[bassTimbre] ?? bassTimbre;
  if (electro) bassTimbre = ELECTRO_BASS[bassTimbre] ?? bassTimbre;
  if (plan.instruments.bass) bassTimbre = plan.instruments.bass;
  let bassStyle = instRng.weighted(bassSrc.bass.styles);
  if (dims.pulse > 72) bassStyle = ({ offbeat: "rolling", root8: "pulse16", sparse: "syncopated", sustain: "root8", rootFifth: "root8" } as Partial<Record<BassStyle, BassStyle>>)[bassStyle] ?? bassStyle;
  if (dims.pulse < 28) bassStyle = ({ rolling: "offbeat", pulse16: "root8", root8: "rootFifth", syncopated: "sparse", walking: "rootFifth" } as Partial<Record<BassStyle, BassStyle>>)[bassStyle] ?? bassStyle;
  if (bassTimbre === "808") bassStyle = "slide808";

  let harmonyInst = instRng.weighted(harmonySrc.harmony.insts);
  if (organic) harmonyInst = ORGANIC_SUB[harmonyInst] ?? harmonyInst;
  if (electro) harmonyInst = ELECTRO_SUB[harmonyInst] ?? harmonyInst;
  if (plan.instruments.harmony) harmonyInst = plan.instruments.harmony;
  const harmonyRhythm: HarmonyRhythm =
    (harmonySrc.harmony.rhythms[harmonyInst] as HarmonyRhythm | undefined) ?? DEFAULT_RHYTHM[harmonyInst];

  let leadInst = instRng.weighted(leadSrc.lead.insts);
  if (organic) leadInst = ORGANIC_LEAD[leadInst] ?? leadInst;
  if (electro) leadInst = ELECTRO_LEAD[leadInst] ?? leadInst;
  if (!plan.instruments.lead) {
    if (dims.vocalCharacter > 75) leadInst = "voice";
    else if (dims.vocalCharacter < 20) leadInst = gp > 60 ? "whistle" : "flute";
  }
  if (plan.instruments.lead) leadInst = plan.instruments.lead;
  const melodyStyle = leadSrc.lead.style;

  const swing = drumsSrc.swing;
  const swingGrid = drumsSrc.swingGrid;
  const sb = (step: number) => swingBeat(step, swing, swingGrid);

  const textures = Array.from(new Set([...primary.textures, ...(plan.genres[1] ? GENRES[plan.genres[1].id].textures.slice(0, 1) : []), ...plan.textures]));

  /* --- form --- */
  const form = primary.form;
  const formRng = rng.fork("form");
  const targetSec = formRng.range(62, 84);
  let sections: Section[] = [];
  if (form === "blues") {
    // always at least a verse chorus + a solo chorus; slow blues gets a shorter intro so it stays near 90s
    const n = Math.max(2, Math.min(3, Math.round((targetSec - 6 * barSec) / (12 * barSec))));
    const list: [SectionType, number][] = [["intro", 24 * barSec > 70 ? 2 : 4]];
    for (let i = 0; i < n; i++) list.push([i % 2 === 1 ? "solo" : "verse", 12]);
    list.push(["outro", 2]);
    let bar = 0;
    sections = list.map(([type, bars]) => {
      const s = { type, label: LABELS[type], startBar: bar, bars, intensity: SECTION_INTENSITY[type] };
      bar += bars;
      return s;
    });
  } else {
    let tpl = TEMPLATES[form].map(([type, bars, pr]) => ({ type, bars, pr }));
    const dur = () => tpl.reduce((s, x) => s + x.bars, 0) * barSec;
    // 1) drop optional pairs (2nd verse+chorus) 2) shrink long sections 3) drop bridge/outro as last resort
    const dropTier = (minPr: number) => {
      while (dur() > targetSec + 8) {
        const cands = tpl.filter((x) => x.pr >= minPr);
        if (!cands.length) return;
        const top = Math.max(...cands.map((x) => x.pr));
        tpl = tpl.filter((x) => x.pr !== top);
      }
    };
    dropTier(4);
    while (dur() > targetSec + 8) {
      const longest = tpl.reduce((a, b) => (b.bars > a.bars ? b : a));
      if (longest.bars <= 4) break;
      longest.bars -= 4;
    }
    dropTier(1);
    let guard = 0;
    while (dur() < targetSec - 10 && guard++ < 12) {
      const grow = tpl.filter((x) => ["chorus", "drop", "verse", "breakdown"].includes(x.type) && x.bars < 16);
      if (!grow.length) break;
      grow[guard % grow.length].bars += 4;
    }
    let bar = 0;
    sections = tpl.map(({ type, bars }) => {
      const s = { type, label: LABELS[type], startBar: bar, bars, intensity: SECTION_INTENSITY[type] };
      bar += bars;
      return s;
    });
  }
  // number repeated labels
  const counts: Partial<Record<SectionType, number>> = {};
  for (const s of sections) {
    counts[s.type] = (counts[s.type] ?? 0) + 1;
    const total = sections.filter((x) => x.type === s.type).length;
    if (total > 1) s.label = `${LABELS[s.type]} ${counts[s.type]}`;
  }
  const totalBars = sections.reduce((s, x) => s + x.bars, 0);

  /* --- harmony plan --- */
  const progRng = rng.fork("prog");
  const progs = primary.progressions[family].length ? primary.progressions[family] : primary.progressions.minor;
  const verseProg = progRng.pick(progs);
  const otherProgs = progs.filter((p) => p !== verseProg);
  const chorusProg = otherProgs.length && progRng.chance(0.65) ? progRng.pick(otherProgs) : verseProg;
  const bridgeProg = otherProgs.length > 1 ? otherProgs.find((p) => p !== chorusProg) ?? [...chorusProg.slice(1), chorusProg[0]] : [...chorusProg.slice(1), chorusProg[0]];
  const bpc = primary.barsPerChord;

  const barChords: string[] = [];
  for (const s of sections) {
    let prog = verseProg;
    if (s.type === "chorus" || s.type === "drop" || s.type === "solo") prog = chorusProg;
    if (s.type === "bridge" || s.type === "breakdown") prog = bridgeProg;
    if (form === "blues") {
      prog = verseProg;
      if (s.type === "intro") prog = verseProg.slice(8, 12);
      if (s.type === "outro") prog = [verseProg[0]];
    }
    const per = form === "blues" ? 1 : bpc;
    for (let b = 0; b < s.bars; b++) barChords.push(prog[Math.floor(b / per) % prog.length]);
  }
  const chordAt = (bar: number): Chord => parseRoman(barChords[Math.max(0, Math.min(barChords.length - 1, bar))]);

  const events: NoteEvent[] = [];
  const push = (e: NoteEvent) => {
    if (e.vel > 0.01 && e.dur > 0) events.push(e);
  };

  /* --- drums --- */
  const drumRng = rng.fork("drums");
  const pats = drumsSrc.drums.patterns;
  const patA = pats[drumRng.int(0, pats.length - 1)];
  const patB = pats.length > 1 ? pats.find((p) => p !== patA) ?? patA : patA;
  const df = dims.drumFeel;
  const kitLevel = drumsSrc.drums.level;
  const organicKit = ["acoustic", "brush", "lofi"].includes(kit);

  const shapePattern = (p: DrumPattern): DrumPattern => {
    const out: DrumPattern = {};
    for (const [k, v] of Object.entries(p) as [keyof DrumPattern, string][]) {
      let s = v;
      if (df < 30) s = s.replace(/g/g, ".").replace(/r/g, "x");
      if (df < 15 && (k === "hat" || k === "shaker" || k === "ride")) s = s.split("").map((c, i) => (i % 4 === 0 ? c : ".")).join("");
      if (df > 80 && k === "hat") s = s.split("").map((c) => (c === "." ? "g" : c)).join("");
      out[k] = s;
    }
    if (df > 65) {
      const sn = (out.snare ?? out.clap ?? "................").split("");
      for (let i = 0; i < 16; i++) if (sn[i] === "." && i % 2 === 1 && drumRng.chance((df - 65) / 140)) sn[i] = "g";
      if (out.snare) out.snare = sn.join("");
      const kk = (out.kick ?? "................").split("");
      if (kk[14] === "." && drumRng.chance((df - 65) / 80)) kk[14] = "g";
      out.kick = kk.join("");
    }
    return out;
  };
  const shapedA = shapePattern(patA);
  const shapedB = shapePattern(patB);
  const VEL: Record<string, number> = { X: 1, x: 0.8, g: 0.35, r: 0.6 };

  const hitInst: Record<keyof DrumPattern, string> = {
    kick: "kick",
    snare: "snare",
    clap: "clap",
    hat: "hatC",
    open: "hatO",
    ride: "ride",
    shaker: "shaker",
    rim: "rim",
    perc: "perc",
    tom: "tom",
  };

  /* --- iterate sections --- */
  let prevVoicing: number[] | null = null;
  const leadCenter = LEAD_CENTER[leadInst] - (melodyStyle === "riff" && leadInst !== "acidLead" ? 7 : 0);
  const mel = makeMelodyKit(rng.fork("melody"), leadSrc, melodyStyle, mode, family);

  sections.forEach((sec, si) => {
    const L = LAYERS[sec.type];
    const next = sections[si + 1];
    const intensity = sec.intensity * (0.7 + plan.energy * 0.45);
    const isBig = sec.type === "chorus" || sec.type === "drop" || sec.type === "solo";
    const pattern = isBig || sec.type === "bridge" ? shapedB : shapedA;

    for (let b = 0; b < sec.bars; b++) {
      const bar = sec.startBar + b;
      const t0 = bar * 4;
      const chord = chordAt(bar);
      const lastBar = b === sec.bars - 1;
      const half = b >= sec.bars / 2;

      /* drums */
      let dl = L.drums * kitLevel;
      if (sec.type === "outro" && half) dl *= 0.4;
      if (sec.type === "intro" && form === "edm") dl = 0.7;
      if (dl > 0) {
        const thin = sec.type === "intro" && form !== "edm";
        const build = sec.type === "build";
        for (const [k, s] of Object.entries(pattern) as [keyof DrumPattern, string][]) {
          if (!s) continue;
          if (thin && !["hat", "shaker", "ride", "rim"].includes(k)) continue;
          if (sec.type === "outro" && half && k !== "kick" && k !== "hat" && k !== "shaker") continue;
          if (build && (k === "snare" || k === "clap")) continue;
          if (lastBar && next && df > 25 && (k === "snare" || k === "clap" || k === "tom") && !build) continue; // fill replaces
          for (let i = 0; i < 16; i++) {
            const c = s[i];
            if (!c || c === ".") continue;
            if (lastBar && next && df > 25 && i >= 12 && k === "kick" && !build) continue;
            const v = VEL[c] ?? 0.8;
            const human = organicKit ? drumRng.range(-0.012, 0.012) : 0;
            const vel = v * dl * (0.75 + 0.25 * intensity) * drumRng.range(0.88, 1);
            if (c === "r") {
              for (let j = 0; j < 3; j++) push({ stem: "drums", inst: hitInst[k], kit, t: t0 + sb(i) + (j * 0.25) / 3, dur: 0.1, midi: 0, vel: vel * (0.7 + j * 0.15) });
            } else push({ stem: "drums", inst: hitInst[k], kit, t: t0 + sb(i) + human, dur: 0.25, midi: k === "tom" ? 45 + (i % 3) * 3 : 0, vel });
          }
        }
        // build: snare roll that accelerates
        if (build) {
          const prog = b / sec.bars;
          const div = prog < 0.25 ? 4 : prog < 0.5 ? 2 : 1;
          for (let i = 0; i < 16; i += div) {
            const p = (b * 16 + i) / (sec.bars * 16);
            push({ stem: "drums", inst: kit === "cinematic" ? "tom" : "snare", kit, t: t0 + i * 0.25, dur: 0.2, midi: 45, vel: (0.25 + p * 0.7) * dl });
          }
        }
        // fill into next section
        if (lastBar && next && df > 25 && !build) {
          const fillSteps = df > 70 ? [8, 10, 12, 13, 14, 15] : [12, 14, 15];
          fillSteps.forEach((st, j) => {
            const useTom = organicKit || kit === "cinematic";
            push({ stem: "drums", inst: useTom && j % 2 === 1 ? "tom" : "snare", kit, t: t0 + sb(st), dur: 0.2, midi: 50 - j * 2, vel: (0.5 + j * 0.08) * dl });
          });
          if (!["hat", "ride"].some((k) => pattern[k as keyof DrumPattern])) {
            /* nothing */
          }
          push({ stem: "drums", inst: "kick", kit, t: t0, dur: 0.25, midi: 0, vel: 0.9 * dl });
        }
      }
      // crash on downbeat of big sections
      if (b === 0 && (isBig || (sec.type === "verse" && si > 1)) && dl > 0) {
        push({ stem: "drums", inst: "crash", kit, t: t0, dur: 4, midi: 0, vel: 0.7 * Math.max(0.5, dl) });
      }

      /* bass */
      const bl = L.bass * (sec.type === "intro" && form === "edm" ? 0 : 1);
      if (bl > 0) {
        const style: BassStyle = sec.type === "breakdown" ? "sustain" : sec.type === "build" ? "root8" : bassStyle;
        const nextChord = chordAt(bar + 1);
        bassBar(push, {
          t0,
          sb,
          chord,
          nextChord,
          keyRoot,
          mode,
          style,
          timbre: bassTimbre,
          octave: bassSrc.bass.octave,
          vel: bl * (0.75 + 0.25 * intensity),
          rng: drumRng,
          kickPattern: (shapedA.kick ?? "x...x...x...x..."),
          barInChord: (bar - sec.startBar) % (form === "blues" ? 1 : bpc),
          bpc: form === "blues" ? 1 : bpc,
          lastBar,
        });
      }

      /* harmony */
      const hl = L.harmony;
      if (hl > 0) {
        const chordStart = form === "blues" || (bar - sec.startBar) % bpc === 0;
        let rhythm: HarmonyRhythm = harmonyRhythm;
        if (sec.type === "breakdown") rhythm = ["strum", "pick", "power"].includes(harmonyRhythm) ? "pick" : "sustain";
        if (sec.type === "intro" && form === "edm") rhythm = "sustain";
        if (sec.type === "outro" && half) rhythm = "sustain";
        if (rhythm === "power" && sec.type === "verse") rhythm = "power"; // muted chugs handled via variant
        const span = form === "blues" ? 1 : bpc;
        if (rhythm === "sustain" || rhythm === "swells") {
          if (chordStart) {
            prevVoicing = voiceChord(keyRoot, chord, harmonyCenter(harmonyInst), prevVoicing, harmonySrc.harmony.extend ? 4 : 3);
            for (const n of prevVoicing) push({ stem: "harmony", inst: harmonyInst, t: t0, dur: span * 4 - 0.05, midi: n, vel: 0.5 * hl * (0.8 + 0.2 * intensity) });
          }
        } else {
          prevVoicing = voiceChord(keyRoot, chord, harmonyCenter(harmonyInst), prevVoicing, harmonySrc.harmony.extend ? 4 : 3);
          harmonyBar(push, {
            t0,
            sb,
            chord,
            keyRoot,
            voicing: prevVoicing,
            inst: harmonyInst,
            rhythm,
            vel: hl * (0.75 + 0.25 * intensity),
            rng: drumRng,
            muted: sec.type === "verse" || sec.type === "intro",
            pulse: dims.pulse,
            strum: harmonySrc.harmony.strum ?? "D.D.DU.UD.D.DU.U",
          });
        }
      }

      /* texture */
      if (L.texture > 0) {
        for (const tx of textures) {
          if ((tx === "vinyl" || tx === "tape" || tx === "rain" || tx === "wind") && b === 0) {
            push({ stem: "texture", inst: tx, t: t0, dur: sec.bars * 4, midi: 0, vel: L.texture * (tx === "wind" ? 0.6 : 0.5) });
          }
          if (tx === "drone" && b === 0 && ["intro", "breakdown", "outro", "verse"].includes(sec.type)) {
            push({ stem: "texture", inst: "drone", t: t0, dur: sec.bars * 4 - 0.1, midi: 36 + ((keyRoot + 12) % 12), vel: 0.45 * L.texture });
          }
          if (tx === "shimmer" && ["intro", "breakdown", "chorus", "drop"].includes(sec.type) && b % 2 === 0) {
            const pcs = chordPitchClasses(chord);
            for (let k = 0; k < 4; k++) {
              if (!drumRng.chance(0.45)) continue;
              const pc = pcs[drumRng.int(0, pcs.length - 1)];
              push({ stem: "texture", inst: "shimmer", t: t0 + k * 2, dur: 2, midi: 84 + ((keyRoot + pc) % 12), vel: 0.3 * L.texture });
            }
          }
          if (tx === "impact" && b === 0 && (isBig || (sec.type === "breakdown" && form !== "song"))) {
            push({ stem: "texture", inst: "impact", t: t0, dur: 4, midi: 24 + ((keyRoot + chord.root) % 12), vel: 0.8 });
          }
          if (tx === "riser" && next && (next.type === "drop" || next.type === "chorus") && b === sec.bars - 2) {
            push({ stem: "texture", inst: "riser", t: t0, dur: 8, midi: 0, vel: 0.55 });
          }
        }
      }
    }

    /* lead — phrase-level */
    const ll = LAYERS[sec.type].lead;
    if (ll > 0) {
      const notes = mel.section(sec, {
        chordAt,
        keyRoot,
        center: leadCenter,
        sb,
        density: leadSrc.lead.density * (0.8 + plan.energy * 0.4) * (0.85 + dims.pulse / 300),
      });
      for (const n of notes) push({ stem: "lead", inst: leadInst, t: n.t, dur: n.dur, midi: n.midi, vel: n.vel * ll * (0.8 + 0.2 * intensity), glide: n.glide });
    }
  });

  events.sort((a, b) => a.t - b.t);
  const totalBeats = totalBars * 4;
  return {
    bpm,
    totalBeats,
    durationSec: totalBeats * beatSec,
    sections,
    barChords,
    events,
    keyRoot,
    mode,
    variation,
    arrangement: {
      drumsFrom: drumsSrc.id,
      bassFrom: bassSrc.id,
      harmonyFrom: harmonySrc.id,
      leadFrom: leadSrc.id,
      kit,
      bassTimbre,
      bassStyle,
      harmonyInst,
      harmonyRhythm,
      leadInst,
      melodyStyle,
      textures,
      form,
      swing,
    },
  };
}

function harmonyCenter(inst: HarmonyInst): number {
  return { pad: 62, supersaw: 64, piano: 60, epiano: 62, organ: 60, strumGuitar: 55, cleanGuitar: 58, distGuitar: 50, pluckArp: 64, strings: 60, brass: 58, choir: 62 }[inst];
}

/* ---------------- bass ---------------- */

type Push = (e: NoteEvent) => void;

function bassBar(
  push: Push,
  o: {
    t0: number;
    sb: (s: number) => number;
    chord: Chord;
    nextChord: Chord;
    keyRoot: number;
    mode: ModeId;
    style: BassStyle;
    timbre: BassTimbre;
    octave: number;
    vel: number;
    rng: Rng;
    kickPattern: string;
    barInChord: number;
    bpc: number;
    lastBar: boolean;
  }
) {
  const lowBase = o.octave <= 1 ? 26 : 31; // lowest root
  const fold = (pc: number) => {
    let n = lowBase + ((((o.keyRoot + pc - lowBase) % 12) + 12) % 12);
    if (n > lowBase + 11) n -= 12;
    return n;
  };
  const root = fold(o.chord.root);
  const third = root + (o.chord.tones[1] ?? 4);
  const fifth = root + 7;
  const nextRoot = fold(o.nextChord.root);
  const scale = MODES[o.mode].steps;
  const inst = o.timbre;
  const n = (step: number, midi: number, dur: number, v = 1, glide?: number) =>
    push({ stem: "bass", inst, t: o.t0 + o.sb(step), dur, midi, vel: o.vel * v, glide });

  switch (o.style) {
    case "root8":
      for (let s = 0; s < 16; s += 2) n(s, s === 14 && o.rng.chance(0.3) ? fifth : root, 0.42, s % 4 === 0 ? 1 : 0.8);
      break;
    case "rootFifth":
      n(0, root, 1.4);
      n(8, o.rng.chance(0.8) ? fifth - 12 + 12 : third, 1.4, 0.85);
      if (o.rng.chance(0.35)) {
        // walk-up to next chord
        const step = nextRoot > root ? -1 : 1;
        n(12, nextRoot + step * 2, 0.45, 0.7);
        n(14, nextRoot + step, 0.45, 0.75);
      }
      break;
    case "offbeat":
      for (let s = 2; s < 16; s += 4) n(s, o.rng.chance(0.15) ? root + 12 : root, 0.38, 0.9);
      break;
    case "rolling":
      for (let s = 0; s < 16; s++) if (s % 4 !== 0) n(s, root, 0.2, s % 4 === 2 ? 0.95 : 0.75);
      break;
    case "walking": {
      const tones = [root, root + (o.rng.chance(0.5) ? third - root : scale[1]), fifth, nextRoot + (o.rng.chance(0.5) ? -1 : 1)];
      tones.forEach((m, i) => n(i * 4, m, 0.95, i === 0 ? 1 : 0.85));
      break;
    }
    case "slide808": {
      const hits: number[] = [];
      for (let s = 0; s < 16; s++) if (o.kickPattern[s] && o.kickPattern[s] !== ".") hits.push(s);
      if (!hits.length) hits.push(0, 8);
      hits.forEach((s, i) => {
        const end = i + 1 < hits.length ? hits[i + 1] : 16;
        const isLast = i === hits.length - 1;
        const midi = i > 0 && o.rng.chance(0.25) ? root + 12 : root;
        const glide = isLast && o.rng.chance(0.4) ? (o.rng.chance(0.5) ? 12 : nextRoot - root || 7) : undefined;
        n(s, midi, Math.max(0.3, (end - s) * 0.25 - 0.05), i === 0 ? 1 : 0.85, glide);
      });
      break;
    }
    case "sustain":
      if (o.barInChord === 0) n(0, root, o.bpc * 4 - 0.1, 0.9);
      break;
    case "syncopated": {
      const pats = [[0, 3, 6, 10, 12], [0, 6, 8, 11, 14], [0, 3, 8, 10, 14]];
      const p = pats[o.rng.int(0, pats.length - 1)];
      p.forEach((s, i) => n(s, i === 2 && o.rng.chance(0.4) ? root + 12 : i === 3 && o.rng.chance(0.3) ? fifth : root, 0.35, i === 0 ? 1 : 0.8));
      break;
    }
    case "pulse16":
      for (let s = 0; s < 16; s += 2) n(s, s % 8 === 6 && o.rng.chance(0.5) ? root + 12 : root, 0.4, s % 4 === 0 ? 1 : 0.75);
      break;
    case "riff":
      for (let s = 0; s < 16; s += 2) {
        let m = root;
        if (s === 12 && o.rng.chance(0.5)) m = root + 10;
        if (s === 14 && o.rng.chance(0.5)) m = fifth;
        n(s, m, 0.4, s % 4 === 0 ? 1 : 0.8);
      }
      break;
    case "sparse":
      n(0, root, 1.6);
      n(10, o.rng.chance(0.5) ? fifth : root, 0.9, 0.8);
      if (o.rng.chance(0.4)) n(14, nextRoot + 2, 0.4, 0.6);
      break;
  }
}

/* ---------------- harmony ---------------- */

function guitarVoicing(keyRoot: number, chord: Chord): number[] {
  let r = 40 + ((((keyRoot + chord.root - 40) % 12) + 12) % 12); // E2..D#3
  if (r > 47) r -= 12;
  if (r < 40) r += 12;
  const t = chord.tones;
  if (t.length === 3 && t[1] === 7) return [r, r + 7, r + 12, r + 19];
  const third = t[1];
  const sev = t[3] !== undefined && t[3] < 12 ? t[3] : null;
  return [r, r + 7, r + 12, r + 12 + third, sev !== null ? r + 12 + sev : r + 19, r + 24].sort((a, b) => a - b);
}

function harmonyBar(
  push: Push,
  o: {
    t0: number;
    sb: (s: number) => number;
    chord: Chord;
    keyRoot: number;
    voicing: number[];
    inst: HarmonyInst;
    rhythm: HarmonyRhythm;
    vel: number;
    rng: Rng;
    muted: boolean;
    pulse: number;
    strum: string;
  }
) {
  const { t0, sb, voicing, inst } = o;
  const chordNotes = (step: number, dur: number, v: number, variant?: number, notes = voicing) => {
    for (const m of notes) push({ stem: "harmony", inst, t: t0 + sb(step), dur, midi: m, vel: o.vel * v * 0.5, variant });
  };
  switch (o.rhythm) {
    case "strum": {
      const gv = guitarVoicing(o.keyRoot, o.chord);
      const pat = o.strum;
      for (let s = 0; s < 16; s++) {
        const c = pat[s];
        if (c !== "D" && c !== "U") continue;
        let end = 16;
        for (let k = s + 1; k < 16; k++) if (pat[k] === "D" || pat[k] === "U") { end = k; break; }
        const notes = c === "U" ? gv.slice(-4).reverse() : gv;
        push({ stem: "harmony", inst: "strumGuitar", t: t0 + sb(s), dur: Math.max(0.4, (end - s) * 0.25 + 0.3), midi: gv[0], vel: o.vel * (s % 4 === 0 ? 0.85 : c === "U" ? 0.5 : 0.7), variant: c === "U" ? 1 : 0, notes });
      }
      break;
    }
    case "pick": {
      const gv = guitarVoicing(o.keyRoot, o.chord);
      const order = [0, 3, 1, 4, 2, 3, 1, 4];
      for (let i = 0; i < 8; i++) {
        const m = gv[order[i] % gv.length];
        push({ stem: "harmony", inst: inst === "cleanGuitar" || inst === "strumGuitar" ? "cleanGuitar" : inst, t: t0 + sb(i * 2), dur: 1.2, midi: m, vel: o.vel * (i % 2 === 0 ? 0.6 : 0.45) });
      }
      break;
    }
    case "power": {
      const r = guitarVoicing(o.keyRoot, o.chord)[0];
      const pc = [r, r + 7, r + 12];
      if (o.muted) {
        for (let s = 0; s < 16; s += 2) chordNotes(s, 0.22, s % 4 === 0 ? 0.9 : 0.7, 1, pc);
      } else {
        const sustained = o.rng.chance(0.35);
        if (sustained) chordNotes(0, 3.9, 1, 0, pc);
        else for (let s = 0; s < 16; s += 2) chordNotes(s, 0.45, s % 4 === 0 ? 1 : 0.8, 0, pc);
      }
      break;
    }
    case "stabs": {
      const opts = [[2, 6, 10, 14], [3, 6, 11, 14], [0, 3, 6, 10]];
      const p = opts[o.rng.int(0, opts.length - 1)];
      p.forEach((s) => chordNotes(s, 0.35, 0.85));
      break;
    }
    case "pulse8": {
      const step = o.pulse > 72 ? 1 : 2;
      for (let s = 0; s < 16; s += step) chordNotes(s, step * 0.25 * 0.8, s % 4 === 0 ? 0.9 : 0.65);
      break;
    }
    case "comp": {
      const opts = [[0, 6], [3, 10], [0, 7, 12], [2, 8, 14], [0, 10]];
      const p = opts[o.rng.int(0, opts.length - 1)];
      p.forEach((s, i) => chordNotes(s, i === p.length - 1 ? 1.4 : 0.9, i === 0 ? 0.85 : 0.7));
      break;
    }
    case "arp": {
      const notes = [...voicing, voicing[0] + 12, voicing[1] + 12];
      const dir = o.rng.int(0, 2);
      const seq = dir === 0 ? notes : dir === 1 ? [...notes].reverse() : [...notes, ...notes.slice(1, -1).reverse()];
      const step = o.pulse > 40 ? 1 : 2;
      let k = 0;
      for (let s = 0; s < 16; s += step) push({ stem: "harmony", inst, t: t0 + sb(s), dur: step * 0.25 * 0.9, midi: seq[k++ % seq.length], vel: o.vel * (s % 4 === 0 ? 0.55 : 0.4) });
      break;
    }
    default:
      chordNotes(0, 3.9, 0.9);
  }
}

/* ---------------- melody ---------------- */

type MotifNote = { step: number; len: number; deg: number };
type MelNote = { t: number; dur: number; midi: number; vel: number; glide?: number };

function makeMelodyKit(rng: Rng, src: GenreProfile, style: MelodyStyle, mode: ModeId, family: "major" | "minor") {
  const modeSteps = MODES[mode].steps;
  const scale =
    src.lead.scale === "pentatonic"
      ? family === "major"
        ? [0, 2, 4, 7, 9]
        : [0, 3, 5, 7, 10]
      : src.lead.scale === "blues"
        ? [0, 3, 5, 6, 7, 10]
        : modeSteps;

  const motifs = new Map<string, MotifNote[]>();
  const melodyStyleRef = style;

  const makeMotif = (density: number, lift: number, r: Rng): MotifNote[] => {
    const steps = 32; // 2 bars of 16ths
    const onsets: number[] = [];
    for (let s = 0; s < steps; s++) {
      const beatPos = s % 4;
      let p = 0;
      switch (style) {
        case "straight":
          p = beatPos === 0 ? 0.75 : beatPos === 2 ? 0.55 : 0.05;
          break;
        case "syncopated":
          p = beatPos === 0 ? 0.45 : beatPos === 2 ? 0.55 : beatPos === 3 ? 0.4 : 0.2;
          break;
        case "sparse":
          p = s % 8 === 0 ? 0.55 : beatPos === 2 ? 0.22 : beatPos === 3 ? 0.12 : 0.02;
          break;
        case "arp":
          p = beatPos % 2 === 0 ? 0.95 : 0.35;
          break;
        case "long":
          p = s % 8 === 0 ? 0.55 : s % 4 === 0 ? 0.12 : 0;
          break;
        case "bluesy":
          p = beatPos === 0 ? 0.55 : beatPos === 2 ? 0.6 : 0.08;
          if (s >= 16 && s < 28) p *= 0.35; // call... then space for response
          break;
        case "riff":
          p = beatPos === 0 ? 0.85 : beatPos === 2 ? 0.7 : beatPos === 3 ? 0.35 : 0.25;
          break;
      }
      p = Math.min(0.97, p * (0.55 + density));
      if (r.chance(p)) onsets.push(s);
    }
    if (!onsets.length || onsets[0] > 6) onsets.unshift(r.chance(0.7) ? 0 : 2);
    // ensure some breathing room at the end of the 2-bar phrase
    const trimmed = onsets.filter((s) => s < 30);
    const out: MotifNote[] = [];
    let deg = lift + r.int(0, 2);
    trimmed.forEach((s, i) => {
      const nextS = i + 1 < trimmed.length ? trimmed[i + 1] : 32;
      const len = Math.max(1, Math.min(nextS - s, style === "long" ? 16 : 8));
      if (i > 0) {
        const moves = style === "arp" ? [-2, 2, 2, -2, 4, -4, 1] : style === "riff" ? [0, 0, -1, 1, 2, -2, 3] : [-1, 1, -1, 1, -2, 2, 3, -3, 1, -1];
        deg += r.pick(moves);
        // no more than two of the same scale step in a row (riffs may repeat)
        if (style !== "riff" && out.length >= 2 && out[out.length - 1].deg === deg && out[out.length - 2].deg === deg) deg += r.chance(0.5) ? 1 : -1;
        // pull back toward center
        if (deg > lift + 5) deg -= 2;
        if (deg < lift - 4) deg += 2;
      }
      out.push({ step: s, len, deg });
    });
    return out;
  };

  const vary = (m: MotifNote[], r: Rng, endDeg: number): MotifNote[] => {
    const v = m.map((n) => ({ ...n }));
    const k = Math.min(v.length, r.int(1, 3));
    for (let i = v.length - k; i < v.length; i++) v[i].deg += r.pick([-2, -1, 1, 2]);
    if (v.length) {
      v[v.length - 1].deg = endDeg;
      v[v.length - 1].len = Math.max(v[v.length - 1].len, 32 - v[v.length - 1].step);
    }
    return v;
  };

  const degToMidi = (deg: number, keyRoot: number, center: number) => {
    const n = scale.length;
    let base = center - ((((center - keyRoot) % 12) + 12) % 12); // key root at/below center
    if (center - base > 6) base += 12;
    const oct = Math.floor(deg / n);
    const idx = ((deg % n) + n) % n;
    return base + scale[idx] + oct * 12;
  };

  return {
    section(
      sec: Section,
      o: { chordAt: (bar: number) => Chord; keyRoot: number; center: number; sb: (s: number) => number; density: number }
    ): MelNote[] {
      const kind = sec.type === "chorus" || sec.type === "drop" ? "hook" : sec.type === "solo" ? "solo" : sec.type === "bridge" ? "bridge" : "verse";
      const r = rng.fork(kind + (kind === "solo" ? sec.startBar : ""));
      const density = Math.max(0.1, Math.min(1, o.density + (kind === "hook" ? 0.15 : kind === "solo" ? 0.3 : 0)));
      const lift = kind === "hook" ? 3 : kind === "bridge" ? 1 : 0;
      const key = kind;
      if (!motifs.has(key) || kind === "solo") motifs.set(key, makeMotif(density, lift, r));
      const A = motifs.get(key)!;
      const B = makeMotif(density * 0.9, lift + 2, rng.fork(kind + "B"));
      const out: MelNote[] = [];
      const phrases = Math.max(1, Math.floor(sec.bars / 2));
      let longNotes = sec.type === "breakdown" || sec.type === "intro";
      if (sec.type === "outro") longNotes = true;
      for (let p = 0; p < phrases; p++) {
        if (sec.type === "outro" && p >= 1) break;
        if (sec.type === "intro" && p < phrases - 1) continue; // only a hint at the end of intro
        const pos = p % 4;
        let motif = pos === 1 ? vary(A, r.fork("v" + p), 0) : pos === 3 ? vary(B, r.fork("b" + p), 0) : A;
        if (kind === "solo") motif = makeMotif(density, lift + (p % 2), r.fork("s" + p));
        if (longNotes) motif = motif.filter((n) => n.step % 8 === 0).map((n) => ({ ...n, len: Math.max(n.len, 8) }));
        for (const n of motif) {
          const bar = sec.startBar + p * 2 + Math.floor(n.step / 16);
          if (bar >= sec.startBar + sec.bars) continue;
          const stepInBar = n.step % 16;
          const chord = o.chordAt(bar);
          const chordPcs = chordPitchClasses(chord);
          let midi = degToMidi(n.deg, o.keyRoot, o.center);
          const strong = stepInBar % 8 === 0 || n.len >= 6;
          const pc = (((midi - o.keyRoot) % 12) + 12) % 12;
          const clashes = chordPcs.some((c) => Math.abs(((pc - c + 18) % 12) - 6) === 5 && !chordPcs.includes(pc));
          if (strong || clashes) midi = snapToSet(midi, o.keyRoot, chordPcs);
          while (midi > o.center + 12) midi -= 12;
          while (midi < o.center - 10) midi += 12;
          // break up static lines: a third identical pitch on a weak beat moves to a neighbouring chord tone
          const k = out.length;
          if (melodyStyleRef !== "riff" && k >= 2 && out[k - 1].midi === midi && out[k - 2].midi === midi) {
            const alt = snapToSet(midi + (r.chance(0.5) ? 3 : -3), o.keyRoot, strong ? chordPcs : scale.map((s) => s % 12));
            if (alt !== midi) midi = alt;
          }
          const t = bar * 4 + o.sb(stepInBar);
          const dur = Math.max(0.2, n.len * 0.25 * (longNotes ? 0.98 : 0.88));
          const bend = src.lead.scale === "blues" && n.len >= 4 && r.chance(0.3) ? 1 : undefined;
          out.push({ t, dur, midi: bend ? midi - 1 : midi, vel: (stepInBar % 4 === 0 ? 0.85 : 0.7) * r.range(0.9, 1), glide: bend });
        }
      }
      // land the section on the chord root
      if (out.length) {
        const last = out[out.length - 1];
        const lastBar = Math.floor(last.t / 4);
        const ch = o.chordAt(lastBar);
        last.midi = snapToSet(last.midi, o.keyRoot, [ch.root % 12, chordPitchClasses(ch)[1]]);
        const secEnd = (sec.startBar + sec.bars) * 4;
        last.dur = Math.max(last.dur, Math.min(3, secEnd - last.t - 0.1));
      }
      return out;
    },
  };
}
