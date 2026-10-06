/**
 * Human-facing descriptions of a composed Song, in production language:
 *  - Song Identity card (framework order: Genre, Mood, Palette, Groove, Opening, Development, Hook, Mix, Vocal, Avoid)
 *  - Producer breakdown card (Go wild)
 *  - "Copy as prompt": a Style Prompt + a bracketed Lyrics/Timeline prompt
 * Every card item carries tappable options that map to PlanEdits patches.
 */
import { GENRES, KIT_LABELS, BASS_LABELS, HARMONY_LABELS, LEAD_LABELS, type DrumKit, type BassTimbre, type HarmonyInst, type LeadInst, type BassStyle } from "./genres";
import { MOODS, MOOD_IDS, type Plan, type PlanEdits } from "./parse";
import { MODES, MODE_IDS, MODE_INFO, NOTE_NAMES, keyLabel } from "./theory";
import type { Song } from "./compose";
import {
  AVOIDS,
  AVOID_IDS,
  CHORD_COLORS,
  DELAYS,
  DEVELOPMENT,
  DEV_IDS,
  EDM,
  EDM_IDS,
  ENDINGS,
  FEELS,
  FORM_VARIANTS,
  HOOKS,
  LYRIC_THEMES,
  METERS,
  METER_IDS,
  OPENINGS,
  PROGRESSIONS,
  PROGRESSION_IDS,
  REVERBS,
  TRICKS,
  VOCALS,
  type AvoidId,
  type DevId,
  type StyleOverrides,
} from "./spec";

export type ChipOption = { label: string; plain?: string; active: boolean; patch: PlanEdits };
export type CardItem = {
  id: string;
  title: string;
  value: string;
  detail?: string;
  options: ChipOption[];
  multi?: boolean;
  /** patch that pins the current value (for "keep this, reroll the rest") */
  lock?: PlanEdits;
  /** style keys to clear for "unlock" */
  unlockKeys?: (keyof StyleOverrides)[];
  unlockPlan?: ("bpm" | "root" | "mode" | "instruments")[];
  locked?: boolean;
  flavor?: boolean;
};

const S = (style: StyleOverrides): PlanEdits => ({ style });
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const list = (xs: string[]) => xs.filter(Boolean).join(", ");

const MODE_MOOD: Record<string, string> = {
  ionian: "bright",
  aeolian: "melancholic",
  dorian: "soulful",
  phrygian: "tense",
  lydian: "floating",
  mixolydian: "swaggering",
  locrian: "unstable",
  harmonicMinor: "exotic",
};

/** 2–4 mood adjectives: the user's moods first, then words implied by mode, tempo and rhythm. */
export function moodWords(song: Song, plan: Plan): string[] {
  const out: string[] = plan.moods.map((m) => MOODS[m].label);
  const add = (w: string) => {
    if (out.length < 4 && !out.includes(w)) out.push(w);
  };
  add(MODE_MOOD[song.mode] ?? "moody");
  const t = song.spec.rhythm.tricks;
  if (t.includes("ostinato") || t.includes("polymeter")) add("hypnotic");
  if (song.bpm >= 128) add("driving");
  else if (song.bpm <= 80) add("unhurried");
  if (song.spec.rhythm.feel !== "straight") add("loping");
  if (plan.energy < 0.4) add("restrained");
  else if (plan.energy > 0.7) add("punchy");
  return out.slice(0, 4);
}

/** Core sound palette, 4–8 defining sounds. */
export function palette(song: Song): string[] {
  const a = song.arrangement;
  const avoidDrums = song.spec.production.avoid.includes("drums");
  const out: string[] = [];
  if (!avoidDrums) out.push(KIT_LABELS[a.kit]);
  out.push(BASS_LABELS[a.bassTimbre]);
  out.push(HARMONY_LABELS[a.harmonyInst]);
  out.push(`${LEAD_LABELS[a.hookInst]}${a.hookInst !== a.leadInst ? " chops" : ""} lead`);
  if (a.responseInst !== a.leadInst) out.push(`${LEAD_LABELS[a.responseInst]} answer/Verse B voice`);
  if (song.spec.rhythm.tricks.includes("polymeter") || song.spec.rhythm.tricks.includes("layering")) out.push(`${a.polyInst === "pluckArp" ? "pluck" : a.polyInst === "cleanGuitar" ? "clean guitar" : a.polyInst} polymeter line`);
  if (song.spec.rhythm.tricks.includes("polyrhythm")) out.push("pitched percussion");
  const tex: Record<string, string> = { vinyl: "vinyl crackle", rain: "rain bed", wind: "wind noise", shimmer: "shimmer bells", drone: "tonic drone", tape: "tape hiss", riser: "noise riser", impact: "sub impacts" };
  for (const t of a.textures) if (out.length < 8) out.push(tex[t] ?? t);
  return out.slice(0, 8);
}

function grooveText(song: Song): string {
  const R = song.spec.rhythm;
  const parts = [`${song.bpm} BPM`, song.meterLabel];
  parts.push(R.feel === "straight" ? "straight 16ths" : `${FEELS[R.feel].label.toLowerCase()} ${Math.round(R.swing * 100)}%`);
  if (R.grouping.length > 1 && R.grouping.join() !== "2,2,2,2" && R.meter !== "6/8" && R.meter !== "3/4") parts.push(`accents ${R.grouping.join("+")}`);
  const tr = R.tricks.filter((t) => !["humanize"].includes(t)).map((t) => {
    if (t === "polyrhythm") return `${R.polyRatio[0]}:${R.polyRatio[1]} polyrhythm`;
    if (t === "polymeter") return `${R.polymeterCycle}-over-bar polymeter`;
    if (t === "clave") return `${R.clave} clave`;
    return TRICKS[t].label.toLowerCase();
  });
  if (tr.length) parts.push(tr.join(", "));
  return parts.join(" · ");
}

function devText(song: Song): string[] {
  const d = song.spec.production.development;
  const M: Record<DevId, string> = {
    filter: "low-pass opens in builds, closes in dropout/outro",
    percRise: "percussion density rises (rim/shaker in Verse B, 16th shaker in the final hook)",
    dropouts: "drums cut for the last bar of each build",
    widening: "narrow verses → wide hooks",
    saturation: "bus saturation climbs from 10% to 50%",
    edits: "stutter edits at phrase ends",
  };
  return d.length ? d.map((x) => M[x]) : ["layer adds/removes per section"];
}

function mixText(song: Song): string[] {
  const m = song.spec.production.mix;
  const fx = song.spec.production.fx;
  const out = ["mono sub", m.pads === "wide" ? "wide pads" : "narrow pads", m.drums === "dry" ? "dry drums" : "roomy drums"];
  if (m.contrast) out.push("narrow verses / wide chorus");
  out.push(`${REVERBS[fx.reverb].label.toLowerCase()} reverb`, `${DELAYS[fx.delay].label.toLowerCase()} delay`);
  if (fx.pump) out.push("sidechain pump");
  if (fx.tape) out.push("tape saturation");
  if (fx.crush) out.push("bit-crushed drums");
  return out;
}

function hookText(song: Song): string {
  const P = song.spec.production;
  const a = song.arrangement;
  const what: Record<string, string> = {
    riff: `a ${LEAD_LABELS[a.hookInst]} riff`,
    bassline: `the ${BASS_LABELS[a.bassTimbre]} figure`,
    chords: `a ${HARMONY_LABELS[a.harmonyInst]} chord rhythm`,
    stab: `off-beat ${HARMONY_LABELS[a.harmonyInst]} stabs`,
    rhythm: "a tom rhythm figure",
    texture: `${LEAD_LABELS[a.hookInst]} chops`,
  };
  const tease = P.opening === "hookFragment" ? "teased in the intro, " : "";
  const back = P.hook === "bassline" ? "drives every hook" : "full in each hook";
  return `${what[P.hook]}: ${tease}${back}, octave-doubled in the final hook`;
}

export function genreName(song: Song, plan: Plan): string {
  return song.spec.production.substyle || GENRES[plan.genres[0].id].label;
}

const styleLocked = (edits: PlanEdits, keys: (keyof StyleOverrides)[]) => keys.some((k) => edits.style?.[k] !== undefined);

/** Song Identity card, in the framework's order. */
export function identityCard(song: Song, plan: Plan, edits: PlanEdits = {}): CardItem[] {
  const P = song.spec.production;
  const R = song.spec.rhythm;
  const moods = moodWords(song, plan);
  const intro = song.sections[0];
  return [
    {
      id: "genre",
      title: "Genre",
      value: genreName(song, plan),
      detail: plan.genres.length > 1 ? `blend: ${plan.genres.map((g) => `${GENRES[g.id].label} ${Math.round(g.weight * 100)}%`).join(" + ")}` : undefined,
      options: [
        { label: "Pure (no substyle)", active: !P.edm, patch: S({ edm: undefined, substyle: undefined }) },
        ...EDM_IDS.map((id) => ({ label: EDM[id].label, plain: `${GENRES[EDM[id].genre].label} family, ${EDM[id].bpm[0]}–${EDM[id].bpm[1]} BPM`, active: P.edm === id, patch: S({ edm: id, substyle: undefined }) })),
      ],
      unlockKeys: ["edm", "substyle"],
      locked: styleLocked(edits, ["edm"]),
    },
    {
      id: "mood",
      title: "Mood",
      value: moods.join(", "),
      multi: true,
      options: MOOD_IDS.map((m) => ({ label: MOODS[m].label, active: plan.moods.includes(m), patch: { moods: plan.moods.includes(m) ? plan.moods.filter((x) => x !== m) : [...plan.moods, m].slice(-3) } })),
    },
    { id: "palette", title: "Core Sound Palette", value: list(palette(song)), options: [] },
    {
      id: "groove",
      title: "Groove",
      value: grooveText(song),
      options: METER_IDS.map((m) => ({ label: METERS[m].label, plain: METERS[m].plain, active: R.meter === m, patch: S({ meter: m, grouping: undefined }) })),
      unlockKeys: ["meter", "grouping"],
      locked: styleLocked(edits, ["meter"]),
    },
    {
      id: "opening",
      title: "Opening",
      value: `${OPENINGS[P.opening].label}: ${intro?.desc.changes[0] ?? OPENINGS[P.opening].plain}`,
      options: (Object.keys(OPENINGS) as (keyof typeof OPENINGS)[]).map((o) => ({ label: OPENINGS[o].label, plain: OPENINGS[o].plain, active: P.opening === o, patch: S({ opening: o }) })),
      unlockKeys: ["opening"],
      locked: styleLocked(edits, ["opening"]),
    },
    {
      id: "development",
      title: "Development",
      value: list(devText(song)),
      multi: true,
      options: DEV_IDS.map((d) => ({ label: DEVELOPMENT[d].label, plain: DEVELOPMENT[d].plain, active: P.development.includes(d), patch: S({ development: { [d]: !P.development.includes(d) } }) })),
      unlockKeys: ["development"],
      locked: styleLocked(edits, ["development"]),
    },
    {
      id: "hook",
      title: "Hook",
      value: hookText(song),
      options: (Object.keys(HOOKS) as (keyof typeof HOOKS)[]).map((h) => ({ label: HOOKS[h].label, plain: HOOKS[h].plain, active: P.hook === h, patch: S({ hook: h }) })),
      unlockKeys: ["hook"],
      locked: styleLocked(edits, ["hook"]),
    },
    {
      id: "mix",
      title: "Mix Geometry",
      value: list(mixText(song)),
      multi: true,
      options: [
        { label: "Wide pads", plain: "Chords spread across the stereo field.", active: P.mix.pads === "wide", patch: S({ pads: "wide" }) },
        { label: "Narrow pads", plain: "Chords kept near the center.", active: P.mix.pads === "narrow", patch: S({ pads: "narrow" }) },
        { label: "Dry drums", plain: "Almost no reverb on the kit.", active: P.mix.drums === "dry", patch: S({ drumsRoom: "dry" }) },
        { label: "Roomy drums", plain: "Kit sits in a room.", active: P.mix.drums === "roomy", patch: S({ drumsRoom: "roomy" }) },
        { label: "Narrow verse / wide chorus", plain: "Verses pinched toward mono, hooks open wide.", active: P.mix.contrast, patch: S({ contrast: !P.mix.contrast }) },
      ],
      unlockKeys: ["pads", "drumsRoom", "contrast"],
      locked: styleLocked(edits, ["pads", "drumsRoom", "contrast"]),
    },
    {
      id: "vocal",
      title: "Vocal Status",
      value: VOCALS[P.vocal].label + (P.vocal === "synthVoice" ? " (formant synth, no words)" : ""),
      options: (Object.keys(VOCALS) as (keyof typeof VOCALS)[]).map((v) => ({ label: VOCALS[v].label, plain: VOCALS[v].plain, active: P.vocal === v, patch: S({ vocal: v }) })),
      unlockKeys: ["vocal"],
      locked: styleLocked(edits, ["vocal"]),
    },
    {
      id: "avoid",
      title: "Avoid Rules",
      value: P.avoid.length ? P.avoid.map((x) => AVOIDS[x].label.toLowerCase()).join(", ") : "none set",
      multi: true,
      options: AVOID_IDS.map((x) => ({
        label: AVOIDS[x].label,
        plain: AVOIDS[x].plain,
        active: P.avoid.includes(x),
        patch: S({ avoid: P.avoid.includes(x) ? P.avoid.filter((y) => y !== x) : [...P.avoid, x] as AvoidId[] }),
      })),
      unlockKeys: ["avoid"],
      locked: styleLocked(edits, ["avoid"]),
    },
  ];
}

/** Producer breakdown card (Go wild): every item can be changed or locked. */
export function breakdownCard(song: Song, plan: Plan, edits: PlanEdits = {}): CardItem[] {
  const R = song.spec.rhythm;
  const H = song.spec.harmony;
  const P = song.spec.production;
  const a = song.arrangement;
  const edm = P.edm ? EDM[P.edm] : null;
  const tricks = R.tricks.filter((t) => t !== "humanize");
  const prog = H.progression !== "genre" ? PROGRESSIONS[H.progression] : null;
  const harmonyBits = [
    prog ? `${prog.label} (${prog.roman.join("–")})` : `${song.progressionLabel} changes (${song.barChords.slice(0, 4).join("–")})`,
    H.chordColor !== "auto" ? CHORD_COLORS[H.chordColor].label.toLowerCase() : "",
    H.pedal ? "tonic pedal" : "",
    H.drone ? "drone" : "",
    H.borrowed ? "borrowed chord in the bridge/final hook" : "",
    H.chromatic ? "chromatic approach notes" : "",
    `melody in ${MODE_INFO[song.mode].name}`,
  ];
  const formText = `${FORM_VARIANTS[P.form].label}: ${song.sections.map((s) => s.label).join(" → ")}`;
  const fxBits = mixText(song).slice(3);
  const sec = (k: keyof typeof KIT_LABELS) => KIT_LABELS[k];
  return [
    {
      id: "fusion",
      title: "Fusion",
      value: genreName(song, plan),
      detail: edm ? `${GENRES[plan.genres[0].id].label} base fused with ${edm.label}` : undefined,
      options: EDM_IDS.map((id) => ({ label: EDM[id].label, active: P.edm === id, patch: S({ edm: id, substyle: undefined, wild: true }) })),
      lock: P.edm ? S({ edm: P.edm }) : undefined,
      unlockKeys: ["edm"],
      locked: styleLocked(edits, ["edm"]),
    },
    {
      id: "tempoKey",
      title: "BPM / key / mode",
      value: `${song.bpm} BPM · ${keyLabel(song.keyRoot, song.mode)}`,
      detail: MODE_INFO[song.mode].plain,
      options: [
        ...[-12, -6, 6, 12].map((d) => ({ label: `${d > 0 ? "+" : ""}${d} BPM`, active: false, patch: { bpm: Math.max(55, Math.min(185, song.bpm + d)) } })),
        ...MODE_IDS.map((m) => ({ label: MODE_INFO[m].name, plain: MODE_INFO[m].plain, active: song.mode === m, patch: { mode: m } })),
        ...NOTE_NAMES.map((n, i) => ({ label: `Key ${n}`, active: song.keyRoot === i, patch: { root: i } })),
      ],
      lock: { bpm: song.bpm, root: song.keyRoot, mode: song.mode },
      unlockPlan: ["bpm", "root", "mode"],
      locked: edits.bpm !== undefined || edits.mode !== undefined,
    },
    {
      id: "meter",
      title: "Meter & rhythmic logic",
      value: grooveText(song).split(" · ").slice(1).join(" · "),
      detail: tricks.length ? tricks.map((t) => TRICKS[t].plain).slice(0, 2).join(" ") : undefined,
      multi: true,
      options: [
        ...METER_IDS.map((m) => ({ label: METERS[m].label, plain: METERS[m].plain, active: R.meter === m, patch: S({ meter: m, grouping: undefined }) })),
        ...(["polyrhythm", "polymeter", "clave", "callResponse", "hemiola", "displacement", "brokenTime", "glitch", "triplets", "isorhythm", "ostinato"] as const).map((t) => ({ label: `${R.tricks.includes(t) ? "✓ " : ""}${TRICKS[t].label}`, plain: TRICKS[t].plain, active: R.tricks.includes(t), patch: S({ tricks: { [t]: !R.tricks.includes(t) } }) })),
      ],
      lock: S({ meter: R.meter, tricks: Object.fromEntries(R.tricks.map((t) => [t, true])) }),
      unlockKeys: ["meter", "tricks", "grouping"],
      locked: styleLocked(edits, ["meter", "tricks"]),
    },
    {
      id: "harmony",
      title: "Harmonic logic",
      value: list(harmonyBits),
      options: [
        { label: "Style's own changes", active: H.progression === "genre", patch: S({ progression: "genre" }) },
        ...PROGRESSION_IDS.map((p) => ({ label: PROGRESSIONS[p].label, plain: PROGRESSIONS[p].plain, active: H.progression === p, patch: S({ progression: p }) })),
      ],
      lock: S({ progression: H.progression, chordColor: H.chordColor, harmonyTricks: { pedal: H.pedal, drone: H.drone, borrowed: H.borrowed, chromatic: H.chromatic } }),
      unlockKeys: ["progression", "chordColor", "harmonyTricks"],
      locked: styleLocked(edits, ["progression", "chordColor", "harmonyTricks"]),
    },
    {
      id: "form",
      title: "Form",
      value: formText,
      options: (Object.keys(FORM_VARIANTS) as (keyof typeof FORM_VARIANTS)[]).map((f) => ({ label: FORM_VARIANTS[f].label, plain: FORM_VARIANTS[f].plain, active: P.form === f, patch: S({ form: f }) })),
      lock: S({ form: P.form }),
      unlockKeys: ["form"],
      locked: styleLocked(edits, ["form"]),
    },
    {
      id: "drumsBass",
      title: "Drum & bass design",
      value: `${sec(a.kit)} (${GENRES[a.drumsFrom].label} groove) · ${BASS_LABELS[a.bassTimbre]}, ${a.bassStyle.replace(/([A-Z])/g, " $1").toLowerCase()}`,
      options: [
        ...(Object.keys(KIT_LABELS) as DrumKit[]).map((k) => ({ label: `Kit: ${KIT_LABELS[k]}`, active: a.kit === k, patch: { instruments: { ...plan.instruments, kit: k } } })),
        ...(Object.keys(BASS_LABELS) as BassTimbre[]).map((b) => ({ label: `Bass: ${BASS_LABELS[b]}`, active: a.bassTimbre === b, patch: { instruments: { ...plan.instruments, bass: b } } })),
        ...(["root8", "offbeat", "rolling", "walking", "syncopated", "sustain"] as BassStyle[]).map((b) => ({ label: `Bass line: ${b.replace(/([A-Z0-9]+)/g, " $1").toLowerCase()}`, active: a.bassStyle === b, patch: S({ bassStyle: b }) })),
      ],
      lock: { instruments: { ...plan.instruments, kit: a.kit, bass: a.bassTimbre }, style: { bassStyle: a.bassStyle } },
      unlockKeys: ["bassStyle"],
      unlockPlan: ["instruments"],
      locked: !!plan.instruments.kit || !!plan.instruments.bass,
    },
    {
      id: "leadChords",
      title: "Lead & chord approach",
      value: `${LEAD_LABELS[a.leadInst]} ${a.melodyStyle} lead${a.responseInst !== a.leadInst ? `, ${LEAD_LABELS[a.responseInst]} answers` : ""} · ${HARMONY_LABELS[a.harmonyInst]} (${a.harmonyRhythm})`,
      options: [
        ...(Object.keys(LEAD_LABELS) as LeadInst[]).map((l) => ({ label: `Lead: ${LEAD_LABELS[l]}`, active: a.leadInst === l, patch: { instruments: { ...plan.instruments, lead: l } } })),
        ...(Object.keys(HARMONY_LABELS) as HarmonyInst[]).map((h) => ({ label: `Chords: ${HARMONY_LABELS[h]}`, active: a.harmonyInst === h, patch: { instruments: { ...plan.instruments, harmony: h } } })),
      ],
      lock: { instruments: { ...plan.instruments, lead: a.leadInst, harmony: a.harmonyInst } },
      unlockPlan: ["instruments"],
      locked: !!plan.instruments.lead || !!plan.instruments.harmony,
    },
    {
      id: "fx",
      title: "FX chain",
      value: list(fxBits),
      multi: true,
      options: [
        ...(Object.keys(REVERBS) as (keyof typeof REVERBS)[]).map((r) => ({ label: `${REVERBS[r].label} reverb`, plain: REVERBS[r].plain, active: P.fx.reverb === r, patch: S({ reverb: r }) })),
        ...(Object.keys(DELAYS) as (keyof typeof DELAYS)[]).map((d) => ({ label: `${DELAYS[d].label} delay`, plain: DELAYS[d].plain, active: P.fx.delay === d, patch: S({ delay: d }) })),
        { label: "Sidechain pump", plain: "Chords and bass duck on every kick.", active: P.fx.pump, patch: S({ pump: !P.fx.pump }) },
        { label: "Tape", plain: "Rolled-off highs and soft saturation.", active: P.fx.tape, patch: S({ tape: !P.fx.tape }) },
        { label: "Bit-crush drums", plain: "Gritty, stepped drum texture.", active: P.fx.crush, patch: S({ crush: !P.fx.crush }) },
      ],
      lock: S({ reverb: P.fx.reverb, delay: P.fx.delay, pump: P.fx.pump, tape: P.fx.tape, crush: P.fx.crush }),
      unlockKeys: ["reverb", "delay", "pump", "tape", "crush"],
      locked: styleLocked(edits, ["reverb", "delay", "pump", "tape", "crush"]),
    },
    {
      id: "ending",
      title: "Ending",
      value: `${ENDINGS[P.ending].label}: ${ENDINGS[P.ending].plain}`,
      options: (Object.keys(ENDINGS) as (keyof typeof ENDINGS)[]).map((e) => ({ label: ENDINGS[e].label, plain: ENDINGS[e].plain, active: P.ending === e, patch: S({ ending: e }) })),
      lock: S({ ending: P.ending }),
      unlockKeys: ["ending"],
      locked: styleLocked(edits, ["ending"]),
    },
    {
      id: "gear",
      title: "Gear (flavor only)",
      value: P.gear.join(", "),
      detail: "Real instruments named for flavor; this app approximates them with its own synths.",
      flavor: true,
      options: [],
    },
    {
      id: "theme",
      title: "Vocal / lyric theme",
      value: `${VOCALS[P.vocal].label} · “${P.lyricTheme}”`,
      options: [
        ...(Object.keys(VOCALS) as (keyof typeof VOCALS)[]).map((v) => ({ label: VOCALS[v].label, plain: VOCALS[v].plain, active: P.vocal === v, patch: S({ vocal: v }) })),
        ...LYRIC_THEMES.map((t) => ({ label: t, active: P.lyricTheme === t, patch: S({ lyricTheme: t }) })),
      ],
      lock: S({ vocal: P.vocal, lyricTheme: P.lyricTheme }),
      unlockKeys: ["vocal", "lyricTheme"],
      locked: styleLocked(edits, ["vocal", "lyricTheme"]),
    },
  ];
}

/* ---------------- Copy as prompt ---------------- */

const EMOTIONAL = /\b(energy|emotional|emotion|epic|beautiful|tension|vibe|feel(?:s|ing)?|mood|soaring|magical|haunting|powerful|intense)\b/gi;
const clean = (x: string) => x.replace(EMOTIONAL, "").replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim();

/** Part 1: Style Prompt (the identity, in framework order, incl. Avoid). */
export function stylePrompt(song: Song, plan: Plan): string {
  const card = identityCard(song, plan);
  const v = (id: string) => card.find((c) => c.id === id)?.value ?? "";
  const lines = [
    `Genre: ${v("genre")}`,
    `Mood: ${v("mood")}`,
    `Core sound palette: ${v("palette")}`,
    `Groove: ${v("groove")}`,
    `Opening: ${v("opening")}`,
    `Development: ${v("development")}`,
    `Hook: ${v("hook")}`,
    `Mix geometry: ${v("mix")}`,
    `Vocal status: ${v("vocal")}`,
    `Avoid: ${song.spec.production.avoid.length ? song.spec.production.avoid.map((x) => AVOIDS[x].label.toLowerCase()).join(", ") : "none"}`,
  ];
  if (song.spec.production.wild && song.spec.production.gear.length) lines.push(`Gear inspiration (flavor only): ${song.spec.production.gear.join(", ")}`);
  return lines.join("\n");
}

/** Part 2: Lyrics/Timeline prompt — a Global bracket then one bracket per section, production terms only. */
export function timelinePrompt(song: Song, plan: Plan): string {
  const P = song.spec.production;
  const dyn = plan.energy < 0.45 ? "restrained dynamics" : plan.energy > 0.72 ? "punchy dynamics" : "moderate dynamics";
  const global = [
    "Global",
    P.vocal === "instrumental" ? "instrumental" : "synthetic voice, no lyrics",
    `${song.bpm} BPM`,
    song.meterLabel,
    keyLabel(song.keyRoot, song.mode),
    "mono sub",
    P.mix.pads === "wide" ? "wide pads" : "narrow pads",
    P.mix.drums === "dry" ? "dry drums" : "roomy drums",
    dyn,
  ];
  if (P.avoid.length) global.push(`no ${P.avoid.map((x) => AVOIDS[x].label.toLowerCase()).join(", no ")}`);
  const out = [`[${global.join(" | ")}]`];
  for (const s of song.sections) {
    const parts = [s.label, `${s.bars} bar${s.bars > 1 ? "s" : ""}`, s.desc.instruments.slice(0, 5).join(" + "), clean(s.desc.changes.join("; "))];
    out.push(`[${parts.filter(Boolean).join(" | ")}]`);
  }
  if (P.vocal === "synthVoice") out.push(`(theme for wordless voice: ${P.lyricTheme})`);
  return out.join("\n");
}

export function copyPrompt(song: Song, plan: Plan): string {
  return `STYLE PROMPT\n${stylePrompt(song, plan)}\n\nLYRICS / TIMELINE PROMPT\n${timelinePrompt(song, plan)}`;
}

export { cap };
