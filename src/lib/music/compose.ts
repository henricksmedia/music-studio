/**
 * Composer: Plan + dimensions + variation → a fully arranged Song (pure data, no audio).
 * Song = an IDENTITY (style spec, true throughout) + a TIMELINE (sections, each with
 * instruments / rhythm / production changes / role). Deterministic for the same inputs.
 */
import { KIT_LABELS, BASS_LABELS, HARMONY_LABELS, LEAD_LABELS, type GenreId, type DrumKit, type BassTimbre, type BassStyle, type HarmonyInst, type HarmonyRhythm, type LeadInst, type MelodyStyle, type TextureId, type DrumPattern, type Form } from "./genres";
import { MODES, MODE_INFO, conformToMode, parseRoman, voiceChord, colorChord, type Chord, type ModeId } from "./theory";
import { makeRng } from "./rng";
import type { Plan } from "./parse";
import { PROGRESSIONS, POLYMETER_CYCLES, type StyleSpec, type TrickId } from "./spec";
import { pickSources, pickInstruments, applyAvoid, resolveSpec, pickGear, type ComposeDims } from "./resolve";
import { barInfo, flavorOf, generatePattern, BROKEN_44, applyGroupingToKick, claveHits, evenHits, swingBeat, type BarInfo } from "./groove";
import { bassBar, harmonyBar, harmonyCenter, type BassMode, type Figure, type HarmonyOpts } from "./parts";
import { makeMelodyKit, type PhraseBar, type SectionKind } from "./melody";

export type StemId = "drums" | "bass" | "harmony" | "lead" | "texture";
export const STEM_IDS: StemId[] = ["drums", "bass", "harmony", "lead", "texture"];

export type NoteEvent = {
  stem: StemId;
  inst: string;
  t: number;
  dur: number;
  midi: number;
  vel: number;
  kit?: DrumKit;
  glide?: number;
  variant?: number;
  notes?: number[];
};

export type SectionType = "intro" | "verse" | "build" | "chorus" | "drop" | "dropout" | "breakdown" | "bridge" | "solo" | "outro";
export type SectionDesc = { instruments: string[]; rhythm: string; changes: string[]; role: string };
export type Section = {
  type: SectionType;
  label: string;
  startBar: number;
  bars: number;
  startBeat: number;
  beats: number;
  intensity: number;
  part?: "A" | "B";
  final?: boolean;
  desc: SectionDesc;
};
export type AutoPoint = { beat: number; filter: number; res: number; width: number; sat: number; delay: number; drumFilter: number };

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
  responseInst: LeadInst;
  hookInst: LeadInst;
  polyInst: string;
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
  barStarts: number[];
  barSteps: number[];
  events: NoteEvent[];
  keyRoot: number;
  mode: ModeId;
  arrangement: Arrangement;
  variation: number;
  spec: StyleSpec;
  automation: AutoPoint[];
  meterLabel: string;
  progressionLabel: string;
  tonicTail: number;
};

const SECTION_INTENSITY: Record<SectionType, number> = { intro: 0.35, verse: 0.6, build: 0.7, chorus: 0.95, drop: 1, dropout: 0.15, breakdown: 0.3, bridge: 0.45, solo: 0.9, outro: 0.35 };
type LayerLevels = { drums: number; bass: number; harmony: number; lead: number; texture: number };
const LAYERS: Record<SectionType, LayerLevels> = {
  intro: { drums: 0.6, bass: 0.7, harmony: 0.8, lead: 0.55, texture: 1 },
  verse: { drums: 0.75, bass: 0.85, harmony: 0.7, lead: 0.75, texture: 0.5 },
  build: { drums: 0.8, bass: 0.7, harmony: 0.8, lead: 0.4, texture: 1 },
  chorus: { drums: 1, bass: 1, harmony: 1, lead: 1, texture: 0.7 },
  drop: { drums: 1, bass: 1, harmony: 1, lead: 1, texture: 0.7 },
  dropout: { drums: 0.5, bass: 0.8, harmony: 0.6, lead: 0.7, texture: 1 },
  breakdown: { drums: 0.4, bass: 0.45, harmony: 1, lead: 0.6, texture: 1 },
  bridge: { drums: 0.35, bass: 0.6, harmony: 0.6, lead: 0.5, texture: 0.8 },
  solo: { drums: 0.9, bass: 0.9, harmony: 0.75, lead: 1, texture: 0.5 },
  outro: { drums: 0.55, bass: 0.65, harmony: 0.75, lead: 0.5, texture: 1 },
};

type T = { type: SectionType; bars: number; min: number; pr: number; part?: "A" | "B"; final?: boolean; cold?: boolean };
const sec = (type: SectionType, bars: number, min: number, pr: number, extra: Partial<T> = {}): T => ({ type, bars, min, pr, ...extra });
const TEMPLATES: Record<Exclude<Form, "blues">, T[]> = {
  song: [sec("intro", 4, 2, 0), sec("verse", 8, 4, 0, { part: "A" }), sec("build", 4, 2, 1), sec("chorus", 8, 4, 0), sec("dropout", 2, 1, 3), sec("verse", 8, 4, 3, { part: "B" }), sec("bridge", 4, 2, 2), sec("chorus", 8, 4, 0, { final: true }), sec("outro", 4, 2, 0)],
  edm: [sec("intro", 4, 2, 0), sec("verse", 8, 4, 0, { part: "A" }), sec("build", 4, 2, 1), sec("drop", 8, 4, 0), sec("dropout", 2, 1, 3), sec("verse", 8, 4, 3, { part: "B" }), sec("breakdown", 8, 2, 2), sec("build", 4, 2, 4), sec("drop", 8, 4, 0, { final: true }), sec("outro", 4, 2, 0)],
  ambient: [sec("intro", 4, 2, 0), sec("verse", 8, 4, 0, { part: "A" }), sec("build", 4, 2, 1), sec("chorus", 8, 4, 0), sec("dropout", 2, 1, 3), sec("verse", 8, 4, 3, { part: "B" }), sec("bridge", 4, 2, 2), sec("chorus", 8, 4, 0, { final: true }), sec("outro", 4, 2, 0)],
  cinematic: [sec("intro", 4, 2, 0), sec("verse", 8, 4, 0, { part: "A" }), sec("build", 4, 2, 1), sec("chorus", 8, 4, 0), sec("dropout", 2, 1, 3), sec("verse", 4, 4, 3, { part: "B" }), sec("bridge", 4, 2, 2), sec("chorus", 8, 4, 0, { final: true }), sec("outro", 4, 2, 0)],
};

const TEXTURE_LABELS: Record<TextureId, string> = { vinyl: "vinyl crackle", rain: "rain bed", wind: "wind noise", riser: "noise riser", impact: "impact hits", shimmer: "shimmer bells", drone: "tonic drone", tape: "tape hiss" };
export const BASS_STYLE_PLAIN: Record<string, string> = {
  root8: "driving 8th-note roots",
  rootFifth: "root–fifth bounce",
  offbeat: "off-beat bass",
  rolling: "rolling 16th bass",
  walking: "walking quarter notes",
  slide808: "808 slides following the kick",
  sustain: "long held bass notes",
  syncopated: "syncopated bass pushes",
  pulse16: "pulsing bass",
  riff: "riffing bass",
  sparse: "sparse bass hits",
  ostinato: "fixed bass ostinato",
  isorhythm: "isorhythmic bass loop (rhythm and notes cycle at different lengths)",
  cycle12: "3-beat bass cell looping over the bar",
  hook: "the hook bassline",
  tail: "one long bass tail",
  stop: "stop-time bass hits",
};
export const HARM_PLAIN: Record<string, string> = {
  sustain: "held chords",
  swells: "swelling chords",
  stabs: "off-beat chord stabs",
  strum: "strummed chords",
  pick: "picked arpeggios",
  power: "power-chord 8ths",
  pulse8: "pulsing 8th chords",
  comp: "comping",
  arp: "16th arpeggio",
  ostinato: "fixed arpeggio ostinato",
  hemiola: "chords accent every 3 eighths (hemiola)",
  cross: "3 chords per bar against the 4 (cross-rhythm)",
  hookFigure: "the hook chord figure",
  stop: "stop-time stabs",
  gate: "gated, chopped chords",
  reduced: "root + fifth only",
};

export function compose(plan: Plan, dims: ComposeDims, variation = 0): Song {
  const rng = makeRng(plan.seed ^ Math.imul(variation + 1, 0x9e3779b1));
  const src = pickSources(plan, rng.fork("sources"));
  let inst = pickInstruments(plan, src, dims, rng.fork("inst"));
  const spec = resolveSpec(plan, src, inst, rng.fork("spec"));
  inst = applyAvoid(inst, spec.production.avoid, spec.production.vocal, !!plan.instruments.lead);
  if (spec.harmony.drone && !inst.textures.includes("drone")) inst.textures.push("drone");
  spec.production.gear = pickGear(inst, spec, rng.fork("gear"));
  const R = spec.rhythm;
  const H = spec.harmony;
  const P = spec.production;
  const tricks = new Set(R.tricks);
  const has = (t: TrickId) => tricks.has(t);
  const avoid = new Set(P.avoid);
  const dev = new Set(P.development);
  const primary = src.primary;
  const keyRoot = plan.root;
  const mode = plan.mode;
  const family = MODES[mode].family;
  const bpm = plan.bpm;
  const beatSec = 60 / bpm;
  const swingGrid: 8 | 16 = R.feel === "shuffle" ? 8 : src.drums.swingGrid;
  const sb = (s: number) => swingBeat(s, R.swing, swingGrid);
  const cycle = R.cycle;
  const infoCache = new Map<number, BarInfo>();
  const infoFor = (steps: number) => {
    if (!infoCache.has(steps)) infoCache.set(steps, barInfo(steps, R.meter === "mixed" ? null : R.grouping));
    return infoCache.get(steps)!;
  };
  const noDrums = avoid.has("drums");
  const tup = has("septuplets") ? 7 : has("quintuplets") ? 5 : has("triplets") ? 3 : 0;
  const electronicKit = ["electronic", "808", "gated"].includes(inst.kit);
  const organicKit = !electronicKit && inst.kit !== "cinematic";

  /* --- timeline --- */
  // Go wild fusions use the full timeline even on a blues base (12-bar harmony is kept)
  const form: Form = primary.form === "blues" && P.wild ? "song" : primary.form;
  const formRng = rng.fork("form");
  const target = formRng.range(64, 86);
  const secBeats = (bars: number) => {
    let s = 0;
    for (let b = 0; b < bars; b++) s += cycle[b % cycle.length] * 0.25;
    return s;
  };
  let tpl: T[];
  if (form === "blues") {
    const barS = secBeats(1) * beatSec;
    const n = Math.max(2, Math.min(3, Math.round((target - 6 * barS) / (12 * barS))));
    tpl = [sec("intro", 24 * barS > 70 ? 2 : 4, 2, 0), sec("verse", 12, 12, 0, { part: "A" }), sec("solo", 12, 12, 0, { part: "B" })];
    if (n >= 3) tpl.push(sec("verse", 12, 12, 0, { final: true }));
    tpl.push(sec("outro", 2, 2, 0));
  } else {
    tpl = TEMPLATES[form].map((x) => ({ ...x }));
    if (P.form === "slowBurn") {
      // slow burn keeps the full timeline: a long intro and only a half-length first hook
      const firstHook = tpl.find((x) => (x.type === "chorus" || x.type === "drop") && !x.final);
      if (firstHook) {
        firstHook.bars = 4;
        firstHook.min = 2;
      }
      tpl[0].bars = 8;
      tpl[0].min = 4;
    } else if (P.form === "hookFirst") {
      tpl[0] = sec(form === "edm" ? "drop" : "chorus", 4, 2, 0, { cold: true });
    }
    const dur = () => tpl.reduce((s, x) => s + secBeats(x.bars), 0) * beatSec;
    const order = (x: T) =>
      x.type === "verse" && x.part === "B" ? 0 : x.type === "breakdown" ? 1 : x.type === "verse" ? 2 : (x.type === "chorus" || x.type === "drop") && !x.final ? 3 : x.type === "bridge" ? 4 : x.type === "intro" ? 5 : x.type === "outro" ? 6 : x.type === "build" ? 7 : x.final ? 8 : 9;
    let guard = 0;
    while (dur() > target + 5 && guard++ < 80) {
      const c = tpl.filter((x) => x.bars - (x.type === "dropout" ? 1 : 2) >= x.min).sort((a, b) => order(a) - order(b))[0];
      if (!c) break;
      c.bars -= c.type === "dropout" ? 1 : 2;
    }
    // whole sections are only dropped when the song would run far too long (keeps the 9-part timeline)
    while (dur() > Math.max(target + 22, 106)) {
      const pr = Math.max(...tpl.map((x) => x.pr));
      if (pr <= 0) break;
      tpl = tpl.filter((x) => x.pr !== pr);
    }
    guard = 0;
    while (dur() < target - 8 && guard++ < 16) {
      const g = tpl.filter((x) => ["chorus", "drop", "verse", "breakdown"].includes(x.type) && x.bars < 16);
      if (!g.length) break;
      g[guard % g.length].bars += 2;
    }
  }

  const labelFor = (x: T): string => {
    const verseWord = form === "edm" ? "Groove" : form === "cinematic" ? "Theme" : "Verse";
    switch (x.type) {
      case "verse":
        return x.final ? "Final Verse" : `${verseWord} ${x.part ?? "A"}`;
      case "solo":
        return "Verse B (solo)";
      case "chorus": {
        const base = form === "cinematic" ? "Climax" : form === "ambient" ? "Hook" : "Chorus";
        return x.cold ? "Cold Open (Hook)" : x.final ? `Final ${base}` : base;
      }
      case "drop":
        return x.cold ? "Cold Open (Drop)" : x.final ? "Final Drop" : "Drop";
      default:
        return ({ intro: "Intro", build: "Build", dropout: "Dropout", breakdown: "Breakdown", bridge: "Bridge", outro: "Outro" } as Record<string, string>)[x.type] ?? x.type;
    }
  };

  const sections: Section[] = [];
  const barSteps: number[] = [];
  const barStarts: number[] = [];
  {
    let beat = 0;
    let bar = 0;
    const seen: Record<string, number> = {};
    for (const x of tpl) {
      const startBar = bar;
      const startBeat = beat;
      for (let b = 0; b < x.bars; b++) {
        const s = cycle[b % cycle.length];
        barSteps.push(s);
        barStarts.push(beat);
        beat += s * 0.25;
        bar++;
      }
      let label = labelFor(x);
      seen[label] = (seen[label] ?? 0) + 1;
      if (seen[label] > 1) label = `${label} ${seen[label]}`;
      sections.push({
        type: x.type,
        label,
        startBar,
        bars: x.bars,
        startBeat,
        beats: beat - startBeat,
        intensity: Math.min(1, SECTION_INTENSITY[x.type] + (x.final ? 0.05 : 0) + (x.part === "B" ? 0.05 : 0)),
        part: x.part,
        final: x.final,
        desc: { instruments: [], rhythm: "", changes: [], role: "" },
      });
    }
    barStarts.push(beat);
  }
  const totalBars = barSteps.length;
  const barBeatsOf = (bar: number) => barSteps[Math.max(0, Math.min(totalBars - 1, bar))] * 0.25;

  /* --- harmony plan --- */
  const progRng = rng.fork("prog");
  let named = H.progression !== "genre" ? PROGRESSIONS[H.progression] : null;
  if (!named && mode === "locrian") named = PROGRESSIONS.locrianUnrest;
  let verseProg: string[];
  let chorusProg: string[];
  let bridgeProg: string[];
  let bpc: number;
  const blues12 = primary.form === "blues" && !named;
  if (named) {
    verseProg = named.roman;
    chorusProg = named.roman;
    bridgeProg = [...named.roman.slice(2), ...named.roman.slice(0, 2)];
    bpc = bpm >= 118 && form === "edm" ? 2 : 1;
  } else {
    const progs = primary.progressions[family].length ? primary.progressions[family] : primary.progressions.minor;
    verseProg = progRng.pick(progs);
    const others = progs.filter((p) => p !== verseProg);
    chorusProg = others.length && progRng.chance(0.65) ? progRng.pick(others) : verseProg;
    bridgeProg = others.length > 1 ? others.find((p) => p !== chorusProg) ?? [...chorusProg.slice(1), chorusProg[0]] : [...chorusProg.slice(1), chorusProg[0]];
    bpc = primary.barsPerChord;
    // style progressions are written for major/minor; re-spell them diatonically for colored modes
    if (!blues12 && mode !== "ionian" && mode !== "aeolian") {
      const fit = (p: string[]) => p.map((c) => conformToMode(c, mode));
      verseProg = fit(verseProg);
      chorusProg = fit(chorusProg);
      bridgeProg = fit(bridgeProg);
    }
  }
  const color = (prog: string[]) => prog.map((s, i) => colorChord(s, H.chordColor, i, prog.length));
  const borrowedChord = family === "major" ? progRng.pick(["iv", "bVI", "bVII"]) : progRng.pick(["IV", "V", "bII"]);
  const withBorrowed = (prog: string[]) => {
    const p = [...prog];
    p[p.length >= 3 ? 2 : p.length - 1] = borrowedChord;
    return p;
  };
  const withChromatic = (prog: string[]) => {
    const p = [...prog];
    if (parseRoman(p[0]).root === 0) p[p.length - 1] = "bII7";
    return p;
  };
  const progFor = (s: Section): string[] => {
    if (blues12) {
      if (s.type === "intro" || s.type === "build") return verseProg.slice(8, 12);
      if (s.type === "outro" || s.type === "dropout") return [verseProg[0]];
      if (s.type === "chorus" || s.type === "drop") return [...verseProg.slice(4), ...verseProg.slice(0, 4)];
      if (s.type === "bridge" || s.type === "breakdown") return [verseProg[4], verseProg[4], verseProg[6], verseProg[6]];
      return verseProg;
    }
    let p: string[];
    switch (s.type) {
      case "chorus":
      case "drop":
        p = color(chorusProg);
        if (s.final && H.borrowed) p = withBorrowed(p);
        if (s.final && H.chromatic) p = withChromatic(p);
        return p;
      case "bridge":
      case "breakdown":
        p = color(bridgeProg);
        return H.borrowed ? withBorrowed(p) : p;
      case "dropout":
        return [color(chorusProg)[0]];
      default:
        return color(verseProg);
    }
  };
  const barChords: string[] = [];
  for (const s of sections) {
    const prog = progFor(s);
    const per = blues12 ? 1 : bpc;
    for (let b = 0; b < s.bars; b++) barChords.push(prog[Math.floor(b / per) % prog.length]);
  }
  if (barChords.length) {
    const tonic = parseRoman(verseProg[0]).root === 0 ? color(verseProg)[0] : family === "major" ? "I" : "i";
    barChords[barChords.length - 1] = tonic;
  }
  const chordCache = new Map<string, Chord>();
  const chordAt = (bar: number): Chord => {
    const sym = barChords[Math.max(0, Math.min(barChords.length - 1, bar))];
    if (!chordCache.has(sym)) chordCache.set(sym, parseRoman(sym));
    return chordCache.get(sym)!;
  };
  const progressionLabel = named ? named.label : `${src.primary.label} style`;

  /* --- events + humanize --- */
  const events: NoteEvent[] = [];
  const humRng = rng.fork("human");
  const jitterSec = R.humanize * (has("jitter") ? 0.045 : 0.018);
  const push = (e: NoteEvent) => {
    if (e.vel <= 0.01 || e.dur <= 0) return;
    if (e.stem !== "texture" && jitterSec > 0.001) {
      e.t = Math.max(0, e.t + ((humRng() * 2 - 1) * jitterSec) / beatSec);
      e.vel *= 1 - R.humanize * 0.18 * humRng();
    }
    events.push(e);
  };

  /* --- drums setup --- */
  const drumRng = rng.fork("drums");
  const pats = src.drums.drums.patterns;
  const patA = pats[drumRng.int(0, pats.length - 1)];
  const patB = pats.length > 1 ? pats.find((p) => p !== patA) ?? patA : patA;
  const flavor = flavorOf(patA, src.drums.halfTime);
  const df = dims.drumFeel;
  const defaultGrouping = R.grouping.join() === "2,2,2,2";
  const brokenIdx = drumRng.int(0, BROKEN_44.length - 1);
  const patCache = new Map<string, DrumPattern>();
  const shape = (p: DrumPattern, n: number): DrumPattern => {
    const out: DrumPattern = {};
    const st = infoFor(n).starts;
    for (const [k, v] of Object.entries(p) as [keyof DrumPattern, string][]) {
      if (!v) continue;
      let s = v.slice(0, n).padEnd(n, ".");
      if (df < 30) s = s.replace(/g/g, ".").replace(/r/g, "x");
      if (df < 15 && (k === "hat" || k === "shaker" || k === "ride")) s = s.split("").map((c, i) => (st.includes(i) ? c : ".")).join("");
      if (df > 80 && k === "hat") s = s.split("").map((c, i) => (c === "." && i % 2 === 1 ? "g" : c)).join("");
      if (avoid.has("trapHats")) s = s.replace(/r/g, "x");
      out[k] = s;
    }
    if (df > 65) {
      const key = out.snare ? "snare" : out.clap ? "clap" : null;
      if (key) {
        const sn = out[key]!.split("");
        for (let i = 0; i < n; i++) if (sn[i] === "." && i % 2 === 1 && drumRng.chance((df - 65) / 140)) sn[i] = "g";
        out[key] = sn.join("");
      }
      const kk = (out.kick ?? ".".repeat(n)).split("");
      if (kk[n - 2] === "." && drumRng.chance((df - 65) / 80)) kk[n - 2] = "g";
      out.kick = kk.join("");
    }
    return out;
  };
  const pattern = (kind: "A" | "B" | "broken", n: number): DrumPattern => {
    const key = kind + n;
    if (patCache.has(key)) return patCache.get(key)!;
    const info = infoFor(n);
    let p: DrumPattern;
    if (n === 16 && (defaultGrouping || R.meter === "mixed")) p = kind === "broken" ? BROKEN_44[brokenIdx] : kind === "A" ? patA : patB;
    else if (n === 16) p = kind === "broken" ? BROKEN_44[brokenIdx] : applyGroupingToKick(kind === "A" ? patA : patB, info, false);
    else
      p = generatePattern(info, kind === "B" ? { ...flavor, hatStep: flavor.hatStep === 2 ? 1 : flavor.hatStep, openOff: !flavor.openOff } : flavor, {
        broken: kind === "broken",
        halftime: has("halftime") || flavor.halftime,
        backbeat: has("backbeat"),
      });
    if (n === 16 && kind !== "broken") {
      const sk: "snare" | "clap" = p.snare ? "snare" : "clap";
      if (has("halftime")) {
        const s = (p[sk] ?? ".".repeat(16)).split("").map((c, i) => (i === 8 ? "X" : i === 4 || i === 12 ? "." : c));
        p = { ...p, [sk]: s.join("") };
        if (sk === "snare" && p.clap) p = { ...p, clap: p.clap.split("").map((c, i) => (i === 4 || i === 12 ? "." : c)).join("") };
      } else if (has("backbeat")) {
        const s = (p[sk] ?? ".".repeat(16)).split("").map((c, i) => (i === 4 || i === 12 ? "X" : c));
        p = { ...p, [sk]: s.join("") };
      }
    }
    const out = shape(p, n);
    patCache.set(key, out);
    return out;
  };
  const VEL: Record<string, number> = { X: 1, x: 0.8, g: 0.35, r: 0.6 };
  const hitInst: Record<keyof DrumPattern, string> = { kick: "kick", snare: "snare", clap: "clap", hat: "hatC", open: "hatO", ride: "ride", shaker: "shaker", rim: "rim", perc: "perc", tom: "tom" };
  const kitLevel = src.drums.drums.level;
  const breakHits = drumRng.pick([[0, 3, 6], [0, 6, 10], [0, 3, 10], [0, 6, 12]]);

  /* --- figures (ostinato / hooks / iso) --- */
  const figRng = rng.fork("figures");
  const F = (a: [number, number, number][]): Figure => a.map(([step, deg, len]) => ({ step, deg, len }));
  const bassHookFig: Figure = figRng.pick([
    F([[0, 0, 3], [3, 0, 2], [6, 12, 2], [8, 10, 2], [11, 7, 2], [14, 0, 2]]),
    F([[0, 0, 2], [2, 0, 1], [4, 7, 2], [7, 10, 3], [10, 0, 2], [12, 3, 2], [14, 5, 2]]),
    F([[0, 0, 4], [6, 0, 2], [8, 12, 1], [10, 7, 2], [13, 5, 3]]),
  ]);
  const ostFig: Figure = figRng.pick([[0, 2, 1, 3, 0, 2, 1, 4], [0, 1, 2, 4, 2, 1, 0, 3], [0, 3, 2, 3, 1, 3, 2, 3]]).map((d, i) => ({ step: i * 2, deg: d, len: 2 }));
  const chordHookFig: Figure = figRng.pick([F([[0, 0, 3], [3, 0, 3], [6, 0, 4], [10, 0, 2], [12, 0, 4]]), F([[0, 0, 2], [3, 0, 1], [6, 0, 2], [11, 0, 5]])]);
  const stabFig: Figure = figRng.pick([[2, 6, 7, 11, 14], [3, 6, 10, 13]]).map((s) => ({ step: s, deg: 0, len: 1 }));
  const rhythmHook = figRng.pick([[0, 3, 6, 10, 12, 14], [0, 2, 5, 8, 11, 13]]);
  const talea = figRng.pick([[3, 3, 4, 2, 4], [3, 3, 2], [2, 3, 3, 2, 2, 4], [4, 3, 3, 2]]);
  const iso = { talea, color: figRng.pick([[0, 7, 10], [0, 12, 7, 3], [0, 5, 7, 10, 12]].filter((c) => c.length !== talea.length)) };
  const polyC = has("layering") ? 5 : R.polymeterCycle || POLYMETER_CYCLES[0];
  const polyGroups = ({ 7: [2, 2, 3], 5: [3, 2], 3: [3], 9: [2, 2, 2, 3] } as Record<number, number[]>)[polyC] ?? [2, 2, 3];
  const polyAccents = new Set<number>();
  {
    let a = 0;
    for (const g of polyGroups) {
      polyAccents.add(a);
      a += g;
    }
  }
  const polySeq = Array.from({ length: polyC }, (_, i) => [0, 2, 1, 3, 2, 4, 1, 3, 0][i % 9]);
  const polyInstName: string = ["pluckArp", "epiano", "cleanGuitar", "organ"].includes(inst.harmonyInst) ? inst.harmonyInst : organicKit ? "cleanGuitar" : "pluckArp";
  const polyLabel = polyInstName === "cleanGuitar" ? "clean guitar" : polyInstName === "pluckArp" ? "pluck synth" : polyInstName === "epiano" ? "electric piano" : polyInstName;
  const hookInst: LeadInst = P.hook === "texture" ? (P.vocal === "synthVoice" ? "voice" : "bell") : inst.leadInst;
  const arpDir = rng.fork("arp").int(0, 2);

  /* --- melody --- */
  const sigPc = MODE_INFO[mode].signature;
  const modeIsColored = !["ionian", "aeolian"].includes(mode);
  const leadScaleKind = src.lead.lead.scale;
  const modeSteps = MODES[mode].steps;
  const scale =
    leadScaleKind === "blues" && (mode === "aeolian" || mode === "mixolydian")
      ? [0, 3, 5, 6, 7, 10]
      : leadScaleKind === "pentatonic" && !modeIsColored
        ? family === "major"
          ? [0, 2, 4, 7, 9]
          : [0, 3, 5, 7, 10]
        : modeSteps;
  const LEAD_CENTER: Record<LeadInst, number> = { sawLead: 72, squareLead: 72, acidLead: 52, pluck: 74, banjo: 74, guitar: 66, distGuitar: 66, bell: 81, flute: 77, whistle: 81, voice: 67, piano: 72, epiano: 70, strings: 72, brass: 65, harmonica: 69, fmLead: 72 };
  const leadCenter = LEAD_CENTER[inst.leadInst] - (inst.melodyStyle === "riff" && inst.leadInst !== "acidLead" ? 7 : 0);
  const mel = makeMelodyKit(rng.fork("melody"), {
    scale,
    style: inst.melodyStyle,
    signature: modeIsColored && sigPc !== null && scale.includes(sigPc) ? sigPc : null,
    chromatic: H.chromatic,
    dotted: has("dotted"),
    syncopation: R.syncopation,
    bluesBends: leadScaleKind === "blues",
  });

  /* --- section plans --- */
  type HarmMode = HarmonyRhythm | "ostinato" | "hemiola" | "cross" | "hookFigure" | "gate" | "none" | "reduced" | "main";
  type SecPlan = {
    drums: "full" | "thin" | "none" | "noKick" | "outro" | "build";
    pat: "A" | "B" | "broken";
    extraPerc: boolean;
    bigPerc: boolean;
    syncKick: boolean;
    deconstruct: boolean;
    fills: boolean;
    dropLastBar: boolean;
    thinFirstHalf: boolean;
    bass: BassMode | "none" | "main";
    bassShort: boolean;
    harm: HarmMode;
    harmLate: boolean;
    lead: SectionKind | "none";
    leadInst: LeadInst;
    leadShift: number;
    double: boolean;
    response: boolean;
    clave: boolean;
    poly: boolean;
    polymeter: boolean;
    rhythmHook: boolean;
    breakLast: boolean;
    stopBars: number;
    displace: number;
    glitch: boolean;
    drone: number;
    bed: boolean;
    pedal: boolean;
    auto: { filter: [number, number]; res: [number, number]; width: [number, number]; sat: [number, number]; delay: number; drumFilter: [number, number] };
    changes: string[];
    role: string;
  };
  const hasFilter = dev.has("filter");
  const widthBase = P.mix.pads === "wide" ? 1 : 0.45;
  const narrowV = P.mix.contrast ? 0.3 : 0.7;
  const altBass: Partial<Record<BassMode, BassMode>> = { root8: "syncopated", offbeat: "rolling", rolling: "offbeat", walking: "rootFifth", rootFifth: "walking", sustain: "sparse", syncopated: "root8", pulse16: "syncopated", riff: "syncopated", sparse: "rootFifth", slide808: "syncopated" };
  const mainBass: BassMode = P.hook === "bassline" ? "hook" : has("ostinato") && P.hook !== "chords" ? "ostinato" : inst.bassStyle;
  const groovesBass = (b: BassMode): BassMode => (b === "hook" ? b : has("isorhythm") ? "isorhythm" : has("layering") ? "cycle12" : b);
  const mainHarm: HarmMode = has("ostinato") && inst.harmonyRhythm === "arp" ? "ostinato" : "main";
  const hookHarm: HarmMode = P.hook === "chords" || P.hook === "stab" ? "hookFigure" : mainHarm;
  const counterLead = ["bassline", "chords", "stab", "rhythm"].includes(P.hook);
  const satBase = 0.1;
  const fHz = (x: number) => Math.round(180 * Math.pow(110, x));
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const otherInst = (li: LeadInst) => (li === inst.responseInst ? inst.leadInst : inst.responseInst);

  const planSection = (s: Section, si: number): SecPlan => {
    const next = sections[si + 1];
    const w0 = narrowV * widthBase;
    const p: SecPlan = {
      drums: "full",
      pat: "A",
      extraPerc: false,
      bigPerc: false,
      syncKick: false,
      deconstruct: false,
      fills: !!next,
      dropLastBar: false,
      thinFirstHalf: false,
      bass: "main",
      bassShort: false,
      harm: "main",
      harmLate: false,
      lead: "verse",
      leadInst: inst.leadInst,
      leadShift: 0,
      double: false,
      response: has("callResponse"),
      clave: has("clave"),
      poly: false,
      polymeter: has("polymeter") || has("layering"),
      rhythmHook: false,
      breakLast: false,
      stopBars: 0,
      displace: 0,
      glitch: R.glitch > 0.2 || dev.has("edits"),
      drone: H.drone ? 0.35 : 0,
      bed: false,
      pedal: false,
      auto: { filter: [hasFilter ? 0.85 : 1, hasFilter ? 0.85 : 1], res: [0.7, 0.7], width: [w0, w0], sat: [satBase, satBase], delay: 1, drumFilter: [1, 1] },
      changes: [],
      role: "",
    };
    const C = p.changes;
    switch (s.type) {
      case "intro": {
        p.role = "Establishes the texture; holds back the hook and most layers.";
        p.lead = "none";
        p.fills = false;
        p.clave = false;
        p.polymeter = false;
        p.glitch = false;
        p.auto.width = [0.5 * widthBase, 0.6 * widthBase];
        p.pedal = H.pedal;
        switch (P.opening) {
          case "filteredPads":
            p.drums = "none";
            p.bass = "none";
            p.harm = "sustain";
            p.auto.filter = [0.25, hasFilter ? 0.55 : 0.4];
            C.push(`chords alone behind a low-pass at ${fHz(0.25)} Hz, opening to ${fHz(p.auto.filter[1])} Hz`);
            break;
          case "soloBass":
            p.drums = "none";
            p.harm = "none";
            p.bass = mainBass === "hook" ? "hook" : inst.bassStyle;
            C.push("bass alone, dry and centered; nothing else yet");
            break;
          case "distantDrone":
            p.drums = "none";
            p.bass = "none";
            p.harm = "none";
            p.drone = 0.8;
            p.auto.filter = [0.35, 0.5];
            p.auto.delay = 1.6;
            C.push(`tonic drone low-passed at ${fHz(0.35)} Hz in long reverb; no drums or bass`);
            break;
          case "hookFragment":
            p.drums = "none";
            p.bass = "none";
            p.harm = s.bars > 2 ? "sustain" : "none";
            p.lead = "fragment";
            p.auto.filter = [0.4, 0.6];
            C.push("first notes of the hook, filtered and distant, over a held chord");
            break;
          case "drumsAlone":
            p.drums = "full";
            p.bass = "none";
            p.harm = "none";
            p.thinFirstHalf = true;
            p.auto.drumFilter = [hasFilter ? 0.5 : 1, 1];
            C.push(hasFilter ? `drums alone, drum low-pass opening from ${fHz(0.5)} Hz` : "drums alone: hats first, then kick and snare");
            break;
          default:
            p.drums = "none";
            p.bass = "none";
            p.harm = "sustain";
            p.bed = true;
            p.auto.filter = [0.5, 0.65];
            C.push("noise bed (crackle/tape) with one held chord on top");
            break;
        }
        if (noDrums && P.opening === "drumsAlone") {
          p.harm = "sustain";
          C.push("(drums avoided: held chord instead)");
        }
        break;
      }
      case "verse": {
        if (s.part === "B" || s.final) {
          p.role = s.final ? "Last full verse with extra percussion before the ending." : "Restates the groove with a new kick pattern, bass rhythm, register, instrument and width.";
          p.pat = has("brokenTime") ? "broken" : "B";
          p.bass = groovesBass(altBass[inst.bassStyle] ?? "syncopated");
          p.extraPerc = true;
          p.leadShift = leadCenter > 64 ? -12 : 12;
          p.leadInst = inst.responseInst;
          p.displace = has("displacement") ? 0.5 : 0;
          p.poly = has("polyrhythm");
          const w = Math.min(1, (narrowV + 0.3) * widthBase);
          p.auto.width = [w, w];
          p.auto.filter = [hasFilter ? 0.92 : 1, hasFilter ? 0.92 : 1];
          p.breakLast = has("breaks") && !blues12;
          C.push(p.pat === "broken" ? "kick moves to a broken-time pattern" : "different kick placement (pattern B)");
          C.push(`bass rhythm changes to ${BASS_STYLE_PLAIN[p.bass] ?? p.bass}`);
          C.push("rim/shaker added on the off-16ths (higher percussion density)");
          C.push(`motif moves ${p.leadShift > 0 ? "up" : "down"} an octave, played on ${LEAD_LABELS[p.leadInst]}`);
          if (p.displace) C.push("chords and melody shifted an 8th late (metric displacement)");
          C.push(`stereo width opens to ${pct(w)}`);
        } else {
          p.role = "Introduces the main groove and motif at reduced width.";
          p.bass = groovesBass(mainBass === "hook" ? inst.bassStyle : mainBass);
          p.pedal = H.pedal;
          p.harm = mainHarm;
          p.stopBars = blues12 && has("breaks") ? 4 : 0;
          p.breakLast = has("breaks") && !blues12;
          C.push(`narrow image (${pct(w0)} width)${hasFilter ? `, low-pass slightly closed at ${fHz(0.85)} Hz` : ""}`);
          if (p.pedal) C.push("bass holds a tonic pedal under the changes");
          if (p.stopBars) C.push("stop-time: the band hits beat 1 for 4 bars while the lead answers");
        }
        if (p.breakLast) C.push("last bar: syncopated band hits, then silence (break)");
        if (p.polymeter) C.push(`${polyC}-step ${polyLabel} line against the bar, realigning every 4 bars (polymeter)`);
        break;
      }
      case "solo":
        p.role = "Instrumental solo chorus over the same changes.";
        p.pat = "B";
        p.lead = "solo";
        p.bass = altBass[inst.bassStyle] ?? "rootFifth";
        p.extraPerc = true;
        p.response = false;
        p.auto.width = [Math.min(1, (narrowV + 0.3) * widthBase), Math.min(1, (narrowV + 0.3) * widthBase)];
        C.push("lead improvises across the whole chorus", "drums switch to pattern B, rim on the off-16ths", `bass changes to ${BASS_STYLE_PLAIN[p.bass] ?? p.bass}`);
        break;
      case "build": {
        p.role = "Transition into the hook: adds percussion, opens the filter, shortens the bass.";
        p.drums = "build";
        p.extraPerc = true;
        p.syncKick = true;
        p.bass = "root8";
        p.bassShort = true;
        p.lead = "none";
        p.response = false;
        p.pedal = H.pedal;
        p.harm = inst.harmonyRhythm === "sustain" || inst.harmonyRhythm === "swells" ? "pulse8" : "main";
        p.auto.filter = [hasFilter ? 0.55 : 1, 1];
        p.auto.res = [hasFilter ? 0.8 : 0.7, hasFilter ? 4.5 : 1.2];
        p.auto.sat = [satBase, dev.has("saturation") ? 0.45 : 0.22];
        p.auto.width = [0.4 * widthBase, 0.8 * widthBase];
        p.dropLastBar = dev.has("dropouts");
        C.push("hats move to 16ths; a shaker enters and rises");
        if (hasFilter) C.push(`low-pass opens ${fHz(0.55)} Hz → fully open while resonance rises`);
        C.push("bass shortened to staccato 8th roots", "16th kick pickups add syncopation");
        C.push(dev.has("saturation") ? "bus saturation pushed harder" : "light bus saturation added");
        if (form === "edm" && !avoid.has("festivalBuilds")) C.push("snare roll speeds up 4ths → 8ths → 16ths");
        if (p.dropLastBar) C.push("last bar: drums cut for a breath before the hook");
        break;
      }
      case "chorus":
      case "drop": {
        p.pat = "B";
        p.lead = counterLead ? "counter" : "hook";
        p.leadInst = hookInst;
        p.bass = groovesBass(mainBass);
        p.harm = hookHarm;
        p.harmLate = has("hemiola") || has("crossRhythm");
        p.poly = has("polyrhythm");
        p.rhythmHook = P.hook === "rhythm";
        p.auto.width = [widthBase, widthBase];
        p.auto.filter = [1, 1];
        p.auto.sat = [0.25, 0.25];
        if (s.final) {
          p.role = "Last hook: octave double, extra percussion, widest image, more saturation.";
          p.double = true;
          p.bigPerc = true;
          p.syncKick = true;
          p.displace = has("displacement") ? 0.25 : 0;
          const sat = dev.has("saturation") ? 0.5 : 0.35;
          p.auto.sat = [sat, sat];
          const w = Math.min(1.2, widthBase * 1.2);
          p.auto.width = [w, w];
          C.push("hook doubled an octave up", "extra percussion: 16th shaker + open hat/ride on the off-beats", "kick gains syncopated pickups");
          if (H.borrowed) C.push(`harmonic variation: borrowed ${borrowedChord} chord`);
          if (H.chromatic) C.push("chromatic bII7 before home");
          if (p.displace) C.push("hook shifted a 16th (altered rhythm)");
          C.push(`widest image (${pct(w)}), saturation up to ${pct(sat)}`);
        } else {
          p.role = s.label.startsWith("Cold Open") ? "Starts directly on the hook motif." : "Full statement of the hook motif with all layers.";
          C.push(`full band, filter fully open, wide image (${pct(widthBase)})`);
        }
        if (P.hook === "bassline") C.push("the hook bassline carries the section; lead plays a sparse counter-line");
        if (P.hook === "chords" || P.hook === "stab") C.push(`the hook ${P.hook === "stab" ? "stab" : "chord"} rhythm repeats every bar`);
        if (P.hook === "rhythm") C.push("the hook rhythm is doubled on toms");
        if (P.hook === "texture") C.push(`hook played as a chopped ${hookInst === "voice" ? "synthetic-voice" : "bell"} texture`);
        if (p.harmLate) C.push(has("crossRhythm") ? "second half: chords hit 3 against the 4 (cross-rhythm)" : "second half: chord accents regroup in 3s (hemiola)");
        if (p.poly) C.push(`${R.polyRatio[0]}:${R.polyRatio[1]} polyrhythm on pitched percussion`);
        break;
      }
      case "dropout":
        p.role = "Contrast bar: removes kick and harmony before the next section.";
        p.drums = noDrums ? "none" : "thin";
        p.deconstruct = true;
        p.bass = "tail";
        p.harm = "none";
        p.lead = "echo";
        p.response = false;
        p.fills = false;
        p.clave = false;
        p.polymeter = false;
        p.glitch = false;
        p.drone = 0;
        p.auto.filter = [0.3, 0.3];
        p.auto.res = [2, 2];
        p.auto.delay = 2.6;
        p.auto.drumFilter = [0.4, 0.4];
        p.auto.width = [0.6 * widthBase, 0.6 * widthBase];
        C.push("kick out; only a filtered hat remnant", "bass plays one long tail note", s.bars > 1 ? "second bar is near-silent" : "back half of the bar is near-silent", `one hook note through a filtered delay (${fHz(0.3)} Hz)`);
        break;
      case "bridge":
      case "breakdown":
        p.role = "Rule change: no kick, root + fifth harmony, drone, narrow image.";
        p.drums = noDrums ? "none" : "noKick";
        p.deconstruct = has("deconstruction") || s.type === "breakdown";
        p.bass = "sustain";
        p.pedal = H.pedal;
        p.harm = "reduced";
        p.lead = "bridge";
        p.response = false;
        p.drone = Math.max(p.drone, 0.6);
        p.polymeter = false;
        p.clave = false;
        p.poly = false;
        p.auto.width = [0.15, 0.15];
        p.auto.filter = [hasFilter ? 0.58 : 0.64, hasFilter ? 0.68 : 0.72];
        p.auto.sat = [0.05, 0.05];
        p.auto.delay = 1.5;
        C.push("kick and snare removed; light hats only", "harmony reduced to root + fifth", "tonic drone underneath", "image narrows to 15% width");
        if (H.borrowed) C.push(`borrowed ${borrowedChord} chord changes the color`);
        if (p.deconstruct) C.push("remaining percussion thins out bar by bar (deconstruction)");
        break;
      case "outro":
        p.role = "Removes layers in order and returns to the intro texture.";
        p.drums = noDrums ? "none" : "outro";
        p.bass = "sustain";
        p.harm = "sustain";
        p.lead = P.opening === "hookFragment" ? "fragment" : "none";
        p.response = false;
        p.bed = P.opening === "textureBed";
        p.drone = P.opening === "distantDrone" ? 0.7 : p.drone;
        p.clave = false;
        p.polymeter = false;
        p.fills = false;
        p.glitch = false;
        p.auto.filter = [hasFilter ? 0.9 : 1, hasFilter ? 0.3 : 0.6];
        p.auto.width = [0.8 * widthBase, 0.45 * widthBase];
        C.push("percussion leaves first, then snare, then kick", "bass holds to the end", `filters close to ${fHz(p.auto.filter[1])} Hz`, "returns to the intro texture");
        break;
    }
    if (noDrums) p.drums = "none";
    if (p.glitch && s.type !== "intro") C.push("stutter edits at phrase ends");
    if (p.response && ["verse", "hook", "solo"].includes(p.lead)) C.push(`call & response: ${LEAD_LABELS[p.leadInst]} calls, ${LEAD_LABELS[otherInst(p.leadInst)]} answers`);
    if (p.clave && p.drums !== "none") C.push(`${R.clave} clave on rim`);
    return p;
  };

  /* --- render sections --- */
  let prevVoicing: number[] | null = null;
  const automation: AutoPoint[] = [];
  const secPlans: SecPlan[] = [];
  const kitLabel = KIT_LABELS[inst.kit];

  sections.forEach((s, si) => {
    const sp = planSection(s, si);
    secPlans.push(sp);
    const L = LAYERS[s.type];
    const next = sections[si + 1];
    const intensity = s.intensity * (0.7 + plan.energy * 0.45);
    const isHook = s.type === "chorus" || s.type === "drop";
    const secEnd = s.startBeat + s.beats;
    const a = sp.auto;
    automation.push({ beat: s.startBeat, filter: a.filter[0], res: a.res[0], width: a.width[0], sat: a.sat[0], delay: a.delay, drumFilter: a.drumFilter[0] });
    automation.push({ beat: secEnd - 0.03, filter: a.filter[1], res: a.res[1], width: a.width[1], sat: a.sat[1], delay: a.delay, drumFilter: a.drumFilter[1] });

    let phraseStart = s.startBar;
    for (let b = 0; b < s.bars; b++) {
      const bar = s.startBar + b;
      if (b % 4 === 0) phraseStart = bar;
      const n = barSteps[bar];
      const info = infoFor(n);
      const t0 = barStarts[bar];
      const barBeats = n * 0.25;
      const chord = chordAt(bar);
      const lastBar = b === s.bars - 1;
      const half = b >= s.bars / 2;
      let absStep = 0;
      for (let k = phraseStart; k < bar; k++) absStep += barSteps[k];
      const stopTime = sp.stopBars > 0 && b < sp.stopBars;
      const stopBar = stopTime || (sp.breakLast && lastBar && !!next);
      const bh = stopBar ? (stopTime ? [0] : breakHits.filter((x) => x < n)) : undefined;
      const silentHalf = s.type === "dropout" && (s.bars > 1 ? b === s.bars - 1 : false);

      /* drums */
      if (sp.drums !== "none" && !silentHalf) {
        let dl = L.drums * kitLevel;
        const pat = pattern(sp.pat, n);
        const isBuild = sp.drums === "build";
        const cutBar = sp.dropLastBar && lastBar;
        const fillBar = lastBar && !!next && sp.fills && df > 25 && !isBuild && next.type !== "dropout";
        if (stopBar) {
          for (const x of bh!) {
            push({ stem: "drums", inst: "kick", kit: inst.kit, t: t0 + sb(x), dur: 0.25, midi: 0, vel: 0.95 * dl });
            push({ stem: "drums", inst: flavor.snareKey, kit: inst.kit, t: t0 + sb(x), dur: 0.25, midi: 0, vel: 0.8 * dl });
          }
          push({ stem: "drums", inst: "crash", kit: inst.kit, t: t0, dur: 4, midi: 0, vel: 0.5 * dl });
        } else if (!cutBar) {
          if (sp.drums === "outro" && b >= s.bars * 0.75) dl *= 0.6;
          for (const [k, str] of Object.entries(pat) as [keyof DrumPattern, string][]) {
            if (!str) continue;
            const isPerc = ["hat", "shaker", "ride", "rim", "open", "perc"].includes(k);
            if (sp.drums === "thin" && k !== "hat") continue;
            if (sp.drums === "noKick" && k !== "hat" && k !== "shaker" && k !== "ride" && k !== "rim") continue;
            if (sp.thinFirstHalf && !half && !isPerc) continue;
            if (sp.drums === "outro") {
              if (isPerc && k !== "hat" && b >= s.bars / 4) continue; // perc leaves first
              if (k === "hat" && b >= s.bars / 2) continue;
              if ((k === "snare" || k === "clap" || k === "tom") && b >= s.bars / 2) continue;
              if (k === "kick" && b >= s.bars * 0.75 && s.bars > 2) continue;
            }
            if (isBuild && form === "edm" && (k === "snare" || k === "clap") && !avoid.has("festivalBuilds")) continue;
            if (fillBar && (k === "snare" || k === "clap" || k === "tom")) continue;
            for (let i = 0; i < n; i++) {
              let c = str[i];
              if (!c || c === ".") continue;
              if (sp.drums === "thin" && i >= n / 2 && s.bars === 1) continue;
              if (isBuild && k === "hat" && i % 2 === 1 && c !== "X") c = "g";
              if (fillBar && i >= n - 4 && k === "kick") continue;
              if (sp.deconstruct && drumRng.chance(0.15 + 0.6 * (b / Math.max(1, s.bars)))) continue;
              const v = VEL[c] ?? 0.8;
              const vel = v * dl * (0.75 + 0.25 * intensity) * drumRng.range(0.88, 1) * (sp.drums === "thin" ? 0.6 : 1);
              const pos = sp.deconstruct && drumRng.chance(0.2) ? Math.min(n - 1, i + 1) : i;
              if (c === "r") {
                const sub = tup || 3;
                for (let j = 0; j < sub; j++) push({ stem: "drums", inst: hitInst[k], kit: inst.kit, t: t0 + sb(pos) + (j * 0.25) / sub, dur: 0.1, midi: 0, vel: vel * (0.7 + (j / sub) * 0.45) });
              } else push({ stem: "drums", inst: hitInst[k], kit: inst.kit, t: t0 + sb(pos), dur: 0.25, midi: k === "tom" ? 45 + (i % 3) * 3 : 0, vel });
            }
          }
          // build / Verse B / final hook percussion layers
          if (isBuild || sp.bigPerc) {
            for (let i = 0; i < n; i++) push({ stem: "drums", inst: "shaker", kit: inst.kit, t: t0 + sb(i), dur: 0.1, midi: 0, vel: (i % 4 === 0 ? 0.55 : 0.35) * dl * (isBuild ? 0.6 + 0.4 * (b / s.bars) : 1) });
          } else if (sp.extraPerc) {
            for (let i = 0; i < n; i++) if (i % 4 === 3 || (i % 4 === 1 && i % 8 !== 1)) push({ stem: "drums", inst: i % 4 === 3 ? "rim" : "shaker", kit: inst.kit, t: t0 + sb(i), dur: 0.1, midi: 0, vel: 0.42 * dl });
          }
          if (sp.bigPerc) for (const x of info.starts) push({ stem: "drums", inst: drumRng.chance(0.5) ? "hatO" : "ride", kit: inst.kit, t: t0 + sb(Math.min(n - 1, x + 2)), dur: 0.3, midi: 0, vel: 0.5 * dl });
          if (isBuild && form === "edm" && !avoid.has("festivalBuilds")) {
            const prog = b / s.bars;
            const div = prog < 0.25 ? 4 : prog < 0.5 ? 2 : 1;
            for (let i = 0; i < n; i += div) {
              const pp = (b * n + i) / (s.bars * n);
              push({ stem: "drums", inst: inst.kit === "cinematic" ? "tom" : "snare", kit: inst.kit, t: t0 + i * 0.25, dur: 0.2, midi: 45, vel: (0.25 + pp * 0.7) * dl });
            }
          }
          if (sp.syncKick && (isBuild || drumRng.chance(0.45 + R.syncopation * 0.5))) {
            const cands = [3, 7, 10, 11, 14].filter((x) => x < n && !info.starts.includes(x));
            const x = drumRng.pick(cands.length ? cands : [n - 1]);
            push({ stem: "drums", inst: "kick", kit: inst.kit, t: t0 + sb(x), dur: 0.25, midi: 0, vel: 0.55 * dl });
          }
          if (sp.clave && sp.drums !== "thin") {
            for (const x of claveHits(n, (bar - phraseStart) % 2, R.clave, info)) push({ stem: "drums", inst: "rim", kit: inst.kit, t: t0 + sb(x), dur: 0.1, midi: 0, vel: 0.75 * Math.max(0.5, dl) });
          }
          if (sp.poly) {
            const [pa, pb] = R.polyRatio;
            for (const x of evenHits(pa, barBeats)) push({ stem: "drums", inst: "perc", kit: inst.kit, t: t0 + x, dur: 0.2, midi: 76 + (keyRoot % 12), vel: 0.6 * Math.max(0.6, dl) });
            if (pb !== info.starts.length && pb !== n / 2 && pb !== n / 4) for (const x of evenHits(pb, barBeats)) push({ stem: "drums", inst: "perc", kit: inst.kit, t: t0 + x, dur: 0.2, midi: 64 + (keyRoot % 12), vel: 0.45 * Math.max(0.6, dl) });
          }
          if (sp.rhythmHook) for (const x of rhythmHook.filter((y) => y < n)) push({ stem: "drums", inst: "tom", kit: inst.kit, t: t0 + sb(x), dur: 0.3, midi: 43 + (x % 5), vel: 0.75 * dl });
          if (fillBar) {
            const useTom = organicKit || inst.kit === "cinematic";
            if (df > 70) [n - 8, n - 6].filter((x) => x >= 0).forEach((st, j) => push({ stem: "drums", inst: useTom && j % 2 === 1 ? "tom" : "snare", kit: inst.kit, t: t0 + sb(st), dur: 0.2, midi: 50 - j * 2, vel: (0.5 + j * 0.08) * dl }));
            if (tup) {
              for (let j = 0; j < tup; j++) push({ stem: "drums", inst: useTom && j % 2 ? "tom" : "snare", kit: inst.kit, t: t0 + barBeats - 1 + j / tup, dur: 0.15, midi: 50 - j, vel: (0.45 + (j / tup) * 0.45) * dl });
            } else [n - 4, n - 2, n - 1].forEach((st, j) => push({ stem: "drums", inst: useTom && j % 2 === 1 ? "tom" : "snare", kit: inst.kit, t: t0 + sb(st), dur: 0.2, midi: 48 - j * 2, vel: (0.55 + j * 0.1) * dl }));
          }
          if (sp.glitch && b % 2 === 1 && drumRng.chance(R.glitch || 0.3)) {
            const startT = t0 + barBeats - 0.5;
            const reps = drumRng.pick([4, 6, 8]);
            const what = drumRng.pick(avoid.has("trapHats") ? ["snare", "kick"] : ["snare", "hatC", "kick"]);
            for (let j = 0; j < reps; j++) push({ stem: "drums", inst: what, kit: inst.kit, t: startT + (j * 0.5) / reps, dur: 0.06, midi: 0, vel: (0.35 + 0.5 * (j / reps)) * Math.max(0.5, dl) });
          }
        }
      }
      if (b === 0 && (sp.drums === "full" || sp.drums === "build") && (isHook || s.part === "B" || s.type === "solo")) {
        push({ stem: "drums", inst: "crash", kit: inst.kit, t: t0, dur: 4, midi: 0, vel: 0.7 * L.drums });
      }

      /* bass */
      if (sp.bass !== "none" && !(sp.bass === "tail" && b > 0)) {
        let style: BassMode = sp.bass === "main" ? groovesBass(inst.bassStyle) : sp.bass;
        if (stopBar) style = "stop";
        const bl = L.bass * (sp.drums === "outro" && b >= s.bars * 0.75 ? 0.8 : 1);
        bassBar(push, {
          t0,
          n,
          starts: info.starts,
          sb,
          chord,
          nextChord: chordAt(bar + 1),
          keyRoot,
          mode,
          style,
          timbre: inst.bassTimbre,
          octave: src.bass.bass.octave,
          vel: bl * (0.75 + 0.25 * intensity),
          rng: drumRng,
          kickPattern: pattern(sp.pat, n).kick ?? "x".padEnd(n, "."),
          barInChord: (bar - s.startBar) % (blues12 ? 1 : bpc),
          bpc: blues12 ? 1 : bpc,
          pedal: sp.pedal,
          short: sp.bassShort,
          chromatic: H.chromatic && s.type !== "intro",
          syncopation: R.syncopation,
          absStep,
          figure: style === "hook" ? bassHookFig : ostFig.map((f) => ({ step: f.step, deg: [0, 7, 12, 10, 3][f.deg % 5], len: f.len })),
          iso,
          breakHits: bh,
          barBeats: s.type === "dropout" ? s.beats : barBeats,
        });
      }

      /* harmony */
      if (sp.harm !== "none") {
        const hl = L.harmony;
        const chordStart = blues12 || (bar - s.startBar) % bpc === 0;
        type HR = HarmonyOpts["rhythm"];
        let rhythm: HR = sp.harm === "main" ? inst.harmonyRhythm : sp.harm === "reduced" ? "sustain" : (sp.harm as HR);
        if (sp.harmLate && half) rhythm = has("crossRhythm") ? "cross" : "hemiola";
        if (stopBar) rhythm = "stop";
        if (sp.glitch && isHook && (rhythm === "sustain" || rhythm === "swells") && drumRng.chance(Math.max(0.25, R.glitch))) rhythm = "gate";
        const center = harmonyCenter(inst.harmonyInst);
        if (rhythm === "sustain" || rhythm === "swells") {
          if (chordStart || sp.harm === "reduced") {
            prevVoicing = voiceChord(keyRoot, chord, center, prevVoicing, src.harmony.harmony.extend ? 4 : 3);
            const notes = sp.harm === "reduced" ? [prevVoicing[0], prevVoicing[0] + 7] : prevVoicing;
            const span = sp.harm === "reduced" ? barBeats : (blues12 ? 1 : Math.min(bpc, s.bars - (bar - s.startBar))) * barBeats;
            for (const m of notes) push({ stem: "harmony", inst: inst.harmonyInst, t: t0 + sp.displace, dur: Math.max(0.2, span - 0.05 - sp.displace), midi: m, vel: 0.5 * hl * (0.8 + 0.2 * intensity) * (sp.harm === "reduced" ? 0.85 : 1) });
          }
        } else {
          prevVoicing = voiceChord(keyRoot, chord, center, prevVoicing, src.harmony.harmony.extend ? 4 : 3);
          harmonyBar(push, {
            t0,
            n,
            starts: info.starts,
            sb,
            chord,
            keyRoot,
            voicing: prevVoicing,
            inst: inst.harmonyInst,
            rhythm,
            vel: hl * (0.75 + 0.25 * intensity),
            rng: drumRng,
            muted: s.type === "verse" || s.type === "intro",
            pulse: dims.pulse,
            strum: src.harmony.harmony.strum ?? "D.D.DU.UD.D.DU.U",
            figure: rhythm === "hookFigure" ? (P.hook === "stab" ? stabFig : chordHookFig) : ostFig,
            absStep,
            barBeats,
            breakHits: bh,
            arpDir,
            displace: sp.displace,
          });
        }
      }

      /* polymeter / layered-cycle line: its own cycle, realigning every 4-bar phrase */
      if (sp.polymeter && !stopBar) {
        const tones = prevVoicing ? [...prevVoicing, ...prevVoicing.map((m) => m + 12)] : [60, 64, 67, 72];
        for (let x = 0; x < n; x += 2) {
          const k = ((absStep + x) / 2) % polyC;
          push({ stem: "harmony", inst: polyInstName, t: t0 + sb(x), dur: 0.4, midi: tones[polySeq[k] % tones.length], vel: (polyAccents.has(k) ? 0.42 : 0.26) * (isHook ? 1 : 0.85) });
        }
      }

      /* texture */
      for (const tx of inst.textures) {
        if ((tx === "vinyl" || tx === "tape" || tx === "rain" || tx === "wind") && b === 0) push({ stem: "texture", inst: tx, t: t0, dur: s.beats, midi: 0, vel: L.texture * (tx === "wind" ? 0.6 : 0.5) * (sp.bed ? 1.4 : 1) });
        if (tx === "shimmer" && ["intro", "breakdown", "chorus", "drop"].includes(s.type) && b % 2 === 0) {
          const pcs = chord.tones.map((x) => (chord.root + x) % 12);
          for (let k = 0; k < 4; k++) {
            if (!drumRng.chance(0.45)) continue;
            const pc = pcs[drumRng.int(0, pcs.length - 1)];
            push({ stem: "texture", inst: "shimmer", t: t0 + k * (barBeats / 2), dur: 2, midi: 84 + ((keyRoot + pc) % 12), vel: 0.3 * L.texture });
          }
        }
        if (tx === "impact" && b === 0 && (isHook || (s.type === "breakdown" && form !== "song"))) push({ stem: "texture", inst: "impact", t: t0, dur: 4, midi: 24 + ((keyRoot + chord.root) % 12), vel: 0.8 });
        if (tx === "riser" && next && (next.type === "drop" || next.type === "chorus") && b === Math.max(0, s.bars - 2) && !avoid.has("festivalBuilds") && !avoid.has("genericRisers")) push({ stem: "texture", inst: "riser", t: t0, dur: secEnd - t0, midi: 0, vel: 0.55 });
      }
      if (sp.bed && b === 0 && !inst.textures.some((x) => x === "vinyl" || x === "tape" || x === "rain")) push({ stem: "texture", inst: organicKit ? "tape" : "vinyl", t: t0, dur: s.beats, midi: 0, vel: 0.7 });
      if (sp.drone > 0 && b === 0) push({ stem: "texture", inst: "drone", t: t0, dur: s.beats - 0.1, midi: 36 + (keyRoot % 12), vel: 0.5 * sp.drone });
    }

    /* lead — phrase-level, motif-based */
    if (sp.lead !== "none" && L.lead > 0) {
      const phrases: PhraseBar[][] = [];
      for (let b = 0; b < s.bars; b += 2) {
        const ph: PhraseBar[] = [];
        for (let k = b; k < Math.min(s.bars, b + 2); k++) ph.push({ bar: s.startBar + k, start: barStarts[s.startBar + k], info: infoFor(barSteps[s.startBar + k]) });
        phrases.push(ph);
      }
      let use = phrases;
      if (sp.lead === "fragment") use = s.type === "outro" ? phrases.slice(0, 1) : phrases.slice(Math.max(0, phrases.length - 1));
      if (sp.lead === "echo") use = phrases.slice(0, 1).map((ph) => ph.slice(0, 1));
      const center = (sp.leadInst === inst.leadInst ? leadCenter : LEAD_CENTER[sp.leadInst]) + sp.leadShift;
      const respInst = otherInst(sp.leadInst);
      const useResponse = sp.response && ["verse", "hook", "solo"].includes(sp.lead);
      const notes = mel.section(sp.lead, use, {
        chordAt,
        keyRoot,
        center,
        responseCenter: LEAD_CENTER[respInst] - 3,
        sb,
        density: src.lead.lead.density * (0.8 + plan.energy * 0.4) * (0.85 + dims.pulse / 300),
        displace: sp.displace,
        longNotes: s.type === "breakdown" || s.type === "bridge" || sp.lead === "fragment",
        response: useResponse,
        tuplet: tup && next && s.type !== "intro" ? tup : 0,
        secEnd: sp.lead === "echo" ? Math.min(secEnd, s.startBeat + barBeatsOf(s.startBar)) : secEnd,
        seed: sp.lead + (sp.lead === "solo" ? String(s.startBar) : ""),
      });
      const lvl = sp.lead === "counter" ? 0.7 : sp.lead === "fragment" ? 0.75 : 1;
      for (const nn of notes) {
        const instName = nn.response ? respInst : sp.leadInst;
        const chop = P.hook === "texture" && sp.lead === "hook" && nn.dur >= 0.75 && !nn.response;
        const base = { stem: "lead" as const, inst: instName, midi: nn.midi, glide: nn.glide };
        const v = nn.vel * L.lead * lvl * (0.8 + 0.2 * intensity) * (nn.response ? 0.85 : 1);
        if (chop) {
          for (let x = 0; x < nn.dur - 0.1; x += 0.25) push({ ...base, t: nn.t + x, dur: 0.18, vel: v * (x === 0 ? 1 : 0.75) });
        } else push({ ...base, t: nn.t, dur: nn.dur, vel: v });
        if (sp.double && !nn.response && nn.midi + 12 <= 96) push({ ...base, t: nn.t, dur: nn.dur, midi: nn.midi + 12, vel: v * 0.5 });
      }
      if (sp.glitch && R.glitch > 0.3) {
        for (const ph of phrases) {
          const endT = ph[ph.length - 1].start + ph[ph.length - 1].info.steps * 0.25;
          const cand = events.filter((e) => e.stem === "lead" && e.t >= endT - 1.5 && e.t < endT && e.dur >= 0.5);
          const e = cand[cand.length - 1];
          if (e && drumRng.chance(R.glitch)) {
            const reps = Math.floor(e.dur / 0.125);
            e.dur = 0.1;
            for (let j = 1; j < reps; j++) push({ ...e, t: e.t + j * 0.125, dur: 0.09, vel: e.vel * (0.8 - j * (0.4 / Math.max(1, reps))) });
          }
        }
      }
    }
  });

  /* --- ending --- */
  events.sort((x, y) => x.t - y.t);
  const last = sections[sections.length - 1];
  const lastBarIdx = last.startBar + last.bars - 1;
  const lastBarStart = barStarts[lastBarIdx];
  const lastBarBeats = barBeatsOf(lastBarIdx);
  let totalBeats = barStarts[barStarts.length - 1];
  const tonicChord = chordAt(totalBars - 1);
  const tonicVoicing = voiceChord(keyRoot, tonicChord, harmonyCenter(inst.harmonyInst), prevVoicing, 4);
  const lowBase = src.bass.bass.octave <= 1 ? 26 : 31;
  const bassRoot = lowBase + ((((keyRoot + tonicChord.root - lowBase) % 12) + 12) % 12);
  const endInst = inst.harmonyInst === "strumGuitar" ? "cleanGuitar" : inst.harmonyInst;
  const finalHit = (t: number, dur: number, vel: number) => {
    if (!noDrums) {
      push({ stem: "drums", inst: "kick", kit: inst.kit, t, dur: 0.3, midi: 0, vel });
      push({ stem: "drums", inst: "crash", kit: inst.kit, t, dur: 4, midi: 0, vel: 0.8 * vel });
    }
    push({ stem: "bass", inst: inst.bassTimbre, t, dur, midi: bassRoot, vel: 0.9 * vel });
    for (const m of tonicVoicing) push({ stem: "harmony", inst: endInst, t, dur, midi: m, vel: 0.45 * vel });
    const top = tonicVoicing[tonicVoicing.length - 1];
    push({ stem: "lead", inst: inst.leadInst, t, dur, midi: top + 12 > 90 ? top : top + 12, vel: 0.5 * vel });
  };
  const truncateAt = (cut: number) => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.t >= cut - 0.01) events.splice(i, 1);
      else if (e.t + e.dur > cut) e.dur = e.stem === "texture" ? cut - e.t + 0.5 : Math.max(0.1, cut - e.t);
    }
  };
  let tonicTail = 0;
  const endNote = (txt: string) => last.desc.changes.push(txt);
  switch (P.ending) {
    case "fade": {
      const fadeStart = last.startBeat;
      const fadeLen = Math.max(1, totalBeats - fadeStart);
      for (const e of events) if (e.t >= fadeStart) e.vel *= Math.max(0.04, 1 - ((e.t - fadeStart) / fadeLen) * 0.96);
      totalBeats += 2;
      endNote("ending: volume fades out across the outro");
      break;
    }
    case "finalHit": {
      truncateAt(lastBarStart);
      finalHit(lastBarStart, 3.5, 1);
      totalBeats = lastBarStart + 4.5;
      tonicTail = 4.5;
      endNote("ending: everything stops, then one full-band tonic hit rings out");
      break;
    }
    case "cut": {
      truncateAt(lastBarStart);
      if (!noDrums) {
        push({ stem: "drums", inst: "kick", kit: inst.kit, t: lastBarStart, dur: 0.25, midi: 0, vel: 1 });
        push({ stem: "drums", inst: "snare", kit: inst.kit, t: lastBarStart, dur: 0.25, midi: 0, vel: 0.9 });
      }
      push({ stem: "bass", inst: inst.bassTimbre, t: lastBarStart, dur: 0.3, midi: bassRoot, vel: 0.9 });
      for (const m of tonicVoicing) push({ stem: "harmony", inst: endInst, t: lastBarStart, dur: 0.25, midi: m, vel: 0.5 });
      automation.push({ beat: lastBarStart + 0.3, filter: 1, res: 0.7, width: widthBase, sat: 0.1, delay: 0, drumFilter: 1 });
      totalBeats = lastBarStart + 1.5;
      tonicTail = 1.5;
      endNote("ending: hard dry cut on the downbeat");
      break;
    }
    case "ritard": {
      const warpStart = barStarts[Math.max(last.startBar, lastBarIdx - 1)];
      const Lw = lastBarStart + lastBarBeats - warpStart;
      const warp = (t: number) => {
        if (t <= warpStart) return t;
        const u = t - warpStart;
        if (u <= Lw) return warpStart + u + (u * u) / (2 * Lw);
        return warpStart + 1.5 * Lw + (u - Lw) * 2;
      };
      truncateAt(lastBarStart + lastBarBeats);
      for (const e of events) {
        const x = warp(e.t);
        const z = warp(e.t + e.dur);
        e.t = x;
        e.dur = z - x;
      }
      for (const p of automation) p.beat = warp(p.beat);
      const endT = warp(lastBarStart + lastBarBeats);
      finalHit(endT, 4, 0.85);
      totalBeats = endT + 5;
      tonicTail = totalBeats - warpStart;
      for (let i = 0; i < barStarts.length; i++) barStarts[i] = warp(barStarts[i]);
      endNote("ending: tempo slows over the last two bars (ritard) into a held final chord");
      break;
    }
  }
  events.sort((x, y) => x.t - y.t);
  for (let i = events.length - 1; i >= 0; i--) if (events[i].t >= totalBeats - 0.05) events.splice(i, 1);
  for (const e of events) if (e.t + e.dur > totalBeats) e.dur = Math.max(0.05, totalBeats - e.t);
  for (const s of sections) {
    s.startBeat = barStarts[s.startBar];
    s.beats = barStarts[s.startBar + s.bars] - s.startBeat;
  }
  last.beats = totalBeats - last.startBeat;
  automation.sort((x, y) => x.beat - y.beat);

  /* --- descriptions (production language) --- */
  const meterDesc = R.meterLabel + (R.meter !== "mixed" && R.meter !== "6/8" && R.meter !== "3/4" && R.grouping.length > 1 && !defaultGrouping ? ` (${R.grouping.join("+")})` : "");
  const feelDesc = R.feel === "straight" ? "straight" : `${R.feel} ${Math.round(R.swing * 100)}%`;
  sections.forEach((s, i) => {
    const sp = secPlans[i];
    const ins: string[] = [];
    if (sp.drums !== "none") ins.push(`${kitLabel}${sp.drums === "noKick" ? " (no kick)" : sp.drums === "thin" ? " (hats only)" : ""}`);
    if (sp.bass !== "none") ins.push(BASS_LABELS[inst.bassTimbre]);
    if (sp.harm !== "none") ins.push(HARMONY_LABELS[inst.harmonyInst]);
    if (sp.lead !== "none") ins.push(LEAD_LABELS[sp.leadInst] + (sp.response && ["verse", "hook", "solo"].includes(sp.lead) ? ` + ${LEAD_LABELS[otherInst(sp.leadInst)]}` : ""));
    if (sp.lead !== "none" && sp.double) ins.push("octave double");
    if (sp.polymeter) ins.push(`${polyLabel} line`);
    if (sp.poly) ins.push("pitched percussion");
    if (sp.drone > 0) ins.push("tonic drone");
    for (const tx of inst.textures) if (tx !== "drone" && tx !== "riser" && tx !== "impact" && (tx !== "shimmer" || ["intro", "breakdown", "chorus", "drop"].includes(s.type))) ins.push(TEXTURE_LABELS[tx]);
    if (sp.bed && !inst.textures.some((x) => ["vinyl", "tape", "rain"].includes(x))) ins.push(organicKit ? "tape hiss" : "vinyl crackle");
    const rh: string[] = [meterDesc, feelDesc];
    if (sp.drums === "full" || sp.drums === "build" || sp.drums === "outro") {
      rh.push(sp.pat === "broken" ? "broken-time kick/snare" : has("halftime") ? "half-time snare on 3" : flavor.fourFloor && R.meter === "4/4" && defaultGrouping ? "four-on-the-floor kick" : R.meter === "4/4" && defaultGrouping ? "kick/snare backbeat" : "kick on each group start, accent on the downbeat");
      if (sp.pat === "B") rh.push("variant kick pattern");
    } else if (sp.drums === "noKick") rh.push("no kick, hats only");
    else if (sp.drums === "thin") rh.push("filtered hats only");
    if (sp.bass !== "none") rh.push(BASS_STYLE_PLAIN[sp.bass === "main" ? groovesBass(inst.bassStyle) : sp.bass] ?? String(sp.bass));
    if (sp.harm !== "none") rh.push(HARM_PLAIN[sp.harm === "main" ? inst.harmonyRhythm : sp.harm] ?? String(sp.harm));
    if (sp.clave && sp.drums !== "none") rh.push(`${R.clave} clave`);
    if (sp.poly) rh.push(`${R.polyRatio[0]}:${R.polyRatio[1]} polyrhythm`);
    if (sp.polymeter) rh.push(`${polyC}-against-${R.meter === "4/4" ? 8 : "bar"} polymeter`);
    if (tup && sp.fills) rh.push(`${tup === 3 ? "triplet" : tup === 5 ? "quintuplet" : "septuplet"} fills`);
    s.desc = { instruments: ins, rhythm: rh.join(" · "), changes: [...sp.changes, ...s.desc.changes], role: sp.role };
  });

  return {
    bpm,
    totalBeats,
    durationSec: totalBeats * beatSec,
    sections,
    barChords,
    barStarts,
    barSteps,
    events,
    keyRoot,
    mode,
    variation,
    spec,
    automation,
    meterLabel: meterDesc,
    progressionLabel,
    tonicTail,
    arrangement: {
      drumsFrom: src.drums.id,
      bassFrom: src.bass.id,
      harmonyFrom: src.harmony.id,
      leadFrom: src.lead.id,
      kit: inst.kit,
      bassTimbre: inst.bassTimbre,
      bassStyle: inst.bassStyle,
      harmonyInst: inst.harmonyInst,
      harmonyRhythm: inst.harmonyRhythm,
      leadInst: inst.leadInst,
      responseInst: inst.responseInst,
      hookInst,
      polyInst: polyInstName,
      melodyStyle: inst.melodyStyle,
      textures: inst.textures,
      form,
      swing: R.swing,
    },
  };
}
