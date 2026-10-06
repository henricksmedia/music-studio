/**
 * Golden safety net for the genre expansion: proves refactors keep the sound identical.
 *   npx tsx scripts/golden.ts capture   # write fixtures from the current code (only before a planned sound change)
 *   npx tsx scripts/golden.ts check     # compare current code against the fixtures (default)
 *   add --no-audio to skip the offline audio renders
 * Compares, per case: the resolved plan, the composed song (every event), the describe cards and, for a subset,
 * the rendered audio samples. The Genre/Fusion label is compared separately so label-only changes are reported
 * as such instead of as sound changes.
 */
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { OfflineAudioContext } from "node-web-audio-api";
import { parsePrompt, resolvePlan, suggestDimensions, type PlanEdits } from "../src/lib/music/parse";
import { composeWithParts, type Song } from "../src/lib/music/compose";
import { renderSong, type OfflineCtor } from "../src/lib/music/render";
import { goWild } from "../src/lib/music/wild";
import { identityCard, breakdownCard, copyPrompt } from "../src/lib/music/describe";
import { GENRES, GENRE_IDS, KIT_LABELS, BASS_LABELS, HARMONY_LABELS, LEAD_LABELS } from "../src/lib/music/genres";
import { EDM, EDM_IDS, SUBSTYLES } from "../src/lib/music/spec";
import { defaultTracks, partSeeds, type Tracks } from "../src/lib/music/tracks";
import { normalizeSongState, readProjectFile } from "../src/lib/library/db";
import { migrateEdits } from "../src/lib/music/styles/migrate";
import { PROJECT_FILE_FORMAT, type SongState } from "../src/lib/library/types";
import { DEFAULT_DIMENSIONS, type Dimensions } from "../src/lib/types";

const DIR = path.join(__dirname, "golden");
const F = {
  compose: path.join(DIR, "compose.json"),
  audio: path.join(DIR, "audio.json"),
  tables: path.join(DIR, "tables.json"),
  states: path.join(DIR, "songstates-v1.json"),
  project: path.join(DIR, "project-v1.json"),
};
const mode = process.argv[2] === "capture" ? "capture" : "check";
const withAudio = !process.argv.includes("--no-audio");

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}
const hash = (v: unknown) => createHash("sha256").update(typeof v === "string" ? v : stable(v)).digest("hex").slice(0, 20);

/* ---------------- cases ---------------- */

type Case = { id: string; state: SongState };
const dims4 = (d: Dimensions) => ({ drumFeel: d.drumFeel, pulse: d.pulse, genrePull: d.genrePull, vocalCharacter: d.vocalCharacter });

function stateFor(prompt: string, edits: PlanEdits = {}, extra: Partial<SongState> = {}): SongState {
  const pr = parsePrompt(prompt);
  const plan = resolvePlan(pr, edits);
  return { prompt, edits, locks: {}, wild: false, variation: 0, dimensions: suggestDimensions(plan, pr, DEFAULT_DIMENSIONS), tracks: defaultTracks(), engine: 1, ...extra };
}

const PROMPTS = [
  // Generate ideas shown in the app
  "lonely country rock with a trance pulse", "campfire banjo folk at dusk", "dark techno warehouse at 3am", "dreamy 80s synthwave night drive",
  "lo-fi hip hop study beats with rain", "epic cinematic battle with taiko drums", "slow delta blues with harmonica", "aggressive trap with 808s",
  "ambient space drift", "happy summer house party",
  // render-check prompts
  "delta blues, no supersaws, no 808s", "funky groove in 7/8 with clave", "polyrhythm 3 over 4 afrobeat house", "lydian drone ambient with pedal tone",
  "dark psybient, no supersaws, no trap hats, mono sub, wide pads, opening with distant drone, hook is the bassline", "prog rock in 5/4 with hemiola", "aggressive trap, no 808s, no risers",
  // genre survey prompts
  "techno", "house", "deep house", "trance", "drum and bass", "dubstep", "trap", "drill", "phonk", "boom bap", "lo-fi hip hop", "jazz", "bossa nova", "blues",
  "folk", "bluegrass", "country", "rock", "punk", "metal", "pop", "funk", "disco", "reggae", "afrobeat", "r&b", "soul", "gospel", "synthwave", "ambient",
  "cinematic", "hardstyle", "k-pop", "latin salsa",
  // every named substyle phrase the parser knows
  "psybient", "future garage", "melodic techno", "psytrance", "goa", "liquid dnb", "acid house", "breakbeat", "darksynth", "halftime bass", "uk garage",
  "2 step", "future bass", "electro", "dub techno", "trip hop", "glitch hop", "go wild", "random edm fusion",
  // words that hit the old random-label branch
  "industrial techno", "minimal techno", "tech house", "french house", "afro house", "dark trap", "neurofunk", "jungle", "outrun", "dreamwave",
  "chillhop", "jazzhop", "cool jazz", "modal jazz", "nu-jazz", "garage rock", "stoner rock", "arena rock", "post-punk", "delta blues", "chicago blues",
  "texas blues", "appalachian folk", "indie folk", "heartland rock", "outlaw country", "epic trailer", "dark score", "western score", "space ambient",
  "something I have never heard", "a robot learning to hum the blues",
];

function buildCases(): Case[] {
  const out: Case[] = [];
  for (const p of PROMPTS) out.push({ id: `prompt:${p}`, state: stateFor(p) });
  for (const id of GENRE_IDS) {
    const label = GENRES[id].label;
    for (const v of [0, 1, 2]) out.push({ id: `genre:${id}:v${v}`, state: stateFor(label, { genres: [{ id, weight: 1 }] }, { variation: v }) });
    for (const gp of [5, 95]) {
      const s = stateFor(label, { genres: [{ id, weight: 1 }] });
      out.push({ id: `genre:${id}:pull${gp}`, state: { ...s, dimensions: { ...s.dimensions, genrePull: gp } } });
    }
    for (const other of GENRE_IDS.filter((g) => g !== id).slice(0, 2)) out.push({ id: `blend:${id}+${other}`, state: stateFor(label, { genres: [{ id, weight: 0.6 }, { id: other, weight: 0.4 }] }) });
  }
  for (const edm of EDM_IDS) {
    out.push({ id: `edm:${edm}`, state: stateFor("music", { style: { edm } }) });
    out.push({ id: `edm:${edm}:dark`, state: stateFor("dark music", { style: { edm }, moods: ["dark"] }) });
  }
  // Go wild exactly as the app does it (fallback prompts get a delta blues base)
  for (const base of ["delta blues", "campfire banjo folk", "house", "jazz", "cinematic"]) {
    for (const seed of [1, 7, 101, 202, 303, 404, 999]) {
      let pr = parsePrompt(base);
      if (resolvePlan(pr).fallback) pr = parsePrompt(`delta blues ${base}`);
      const plan = resolvePlan(pr);
      const g = goWild(plan, {}, seed);
      out.push({ id: `wild:${base}:${seed}`, state: stateFor(pr.text, g.edits, { wild: true, variation: seed % 7 }) });
    }
  }
  // locks + a wild reroll on top
  {
    const locks: PlanEdits = { style: { edm: "psytrance", ending: "cut" }, instruments: { kit: "808" } };
    const pr = parsePrompt("slow delta blues with harmonica");
    const g = goWild(resolvePlan(pr), locks, 4242);
    out.push({ id: "wild:locked", state: { ...stateFor(pr.text, g.edits, { wild: true, variation: 3 }), locks } });
  }
  // instruments, moods, bpm/key edits
  out.push({ id: "edits:instruments", state: stateFor("lonely country rock", { instruments: { lead: "harmonica", harmony: "organ", bass: "upright", kit: "brush" } }) });
  out.push({ id: "edits:tempo-key", state: stateFor("house", { bpm: 185, root: 3, mode: "phrygian", moods: ["eerie", "dark"] }) });
  out.push({ id: "edits:style", state: stateFor("folk", { style: { meter: "7/8", feel: "shuffle", progression: "andalusian", reverb: "spring", delay: "slap", form: "hookFirst", tricks: { polyrhythm: true } } }) });
  // per-part regeneration seeds and track settings
  for (const [i, p] of ["dark techno warehouse at 3am", "lo-fi hip hop study beats with rain", "slow delta blues with harmonica"].entries()) {
    const tracks: Tracks = defaultTracks();
    tracks.drums.seed = 11 + i;
    tracks.lead.seed = 29 + i;
    tracks.bass.mute = true;
    tracks.harmony.gainDb = -6;
    out.push({ id: `parts:${p}`, state: stateFor(p, {}, { tracks, variation: i }) });
  }
  return out;
}

/* ---------------- run ---------------- */

const labelIds = new Set(["genre", "fusion"]);
function songOf(state: SongState): { song: Song; plan: ReturnType<typeof resolvePlan> } {
  const plan = resolvePlan(parsePrompt(state.prompt), state.edits);
  return { plan, song: composeWithParts(plan, dims4(state.dimensions), state.variation, partSeeds(state.tracks)) };
}
function fingerprint(state: SongState) {
  const { plan, song } = songOf(state);
  const label = song.spec.production.substyle;
  const unlabeled = { ...song, spec: { ...song.spec, production: { ...song.spec.production, substyle: "" } } };
  const cards = [...identityCard(song, plan, state.edits), ...breakdownCard(song, plan, state.edits)].map((c) => (labelIds.has(c.id) ? { ...c, value: "" } : c));
  const prompt = copyPrompt(song, plan).replace(/^Genre: .*$/m, "Genre:");
  return {
    plan: hash(plan),
    song: hash(unlabeled),
    events: song.events.length,
    cards: hash(cards),
    prompt: hash(prompt),
    label,
    gear: song.spec.production.gear.join(" | "),
    summary: `${song.bpm} BPM ${song.meterLabel} ${song.arrangement.kit}/${song.arrangement.bassTimbre}/${song.arrangement.harmonyInst}/${song.arrangement.leadInst} ${song.sections.length} sections ${song.durationSec.toFixed(1)}s`,
  };
}

const AUDIO_CASES = [
  "prompt:dark techno warehouse at 3am", "prompt:slow delta blues with harmonica", "prompt:lo-fi hip hop study beats with rain", "prompt:happy summer house party",
  "wild:delta blues:101", "edm:psytrance", "parts:dark techno warehouse at 3am", "genre:jazz:v1",
];
/** node-web-audio-api renders are not bit-exact run to run (≈1e-7 float noise after ~10 s), so audio is compared as
 *  RMS in dB per 25 ms window and channel, plus the length. Float noise moves a window by ~1e-5 dB; one missing
 *  or changed note moves it by far more than the tolerance. */
type AudioPrint = { frames: number; db: number[][] };
const WINDOW = 551;
const AUDIO_TOLERANCE_DB = 0.01;
async function audioPrint(state: SongState): Promise<AudioPrint> {
  const { song } = songOf(state);
  let buf: AudioBuffer | null = null;
  for (let attempt = 1; !buf; attempt++) {
    try {
      buf = await renderSong(song, state.dimensions, { sampleRate: 22050, Ctor: OfflineAudioContext as unknown as OfflineCtor });
    } catch (err) {
      // the pre-fix chunked render could lose a race in node's async suspend(); never expected after the fix
      if (attempt >= 3 || (err as Error).name !== "InvalidStateError") throw err;
      console.log(`  RENDER RETRY ${attempt}: ${(err as Error).message}`);
    }
  }
  const db: number[][] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    const row: number[] = [];
    for (let i = 0; i < d.length; i += WINDOW) {
      let e = 0;
      const end = Math.min(d.length, i + WINDOW);
      for (let j = i; j < end; j++) e += d[j] * d[j];
      row.push(Math.round(1e4 * Math.max(-90, 10 * Math.log10(e / (end - i) + 1e-12))) / 1e4);
    }
    db.push(row);
  }
  return { frames: buf.length, db };
}
/** Largest per-window loudness difference in dB (and where), ignoring windows where both renders are near silence. */
function audioDeviation(a: AudioPrint, b: AudioPrint): { max: number; at: number } {
  if (a.frames !== b.frames || a.db.length !== b.db.length) return { max: Infinity, at: 0 };
  let max = 0;
  let at = 0;
  a.db.forEach((row, c) => row.forEach((v, i) => {
    const w = b.db[c][i];
    if ((v > -60 || w > -60) && Math.abs(v - w) > max) [max, at] = [Math.abs(v - w), (i * WINDOW) / 22050];
  }));
  return { max, at };
}

function tables() {
  return {
    GENRE_IDS,
    GENRES: hash(GENRES),
    EDM_IDS,
    EDM: hash(EDM),
    SUBSTYLES: hash(SUBSTYLES),
    labels: hash([KIT_LABELS, BASS_LABELS, HARMONY_LABELS, LEAD_LABELS]),
  };
}

const read = <T>(f: string): T => JSON.parse(fs.readFileSync(f, "utf8")) as T;
const write = (f: string, v: unknown) => fs.writeFileSync(f, JSON.stringify(v, null, 1) + "\n");

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  if (mode === "capture") {
    const cases = buildCases();
    const states: Record<string, SongState> = Object.fromEntries(cases.map((c) => [c.id, c.state]));
    // legacy edge cases: states saved by older builds, missing fields, unknown ids
    states["legacy:no-tracks"] = { ...states["prompt:house"], tracks: undefined as unknown as Tracks };
    states["legacy:partial-dims"] = { ...states["prompt:techno"], dimensions: { space: 80 } as unknown as Dimensions };
    write(F.states, states);
    const t0 = new Date(Date.UTC(2026, 9, 6)).getTime();
    const project = {
      format: PROJECT_FILE_FORMAT,
      version: 1,
      exportedAt: t0,
      project: { id: "p-golden", name: "Golden project", createdAt: t0, updatedAt: t0 },
      songs: ["prompt:dark techno warehouse at 3am", "wild:delta blues:101", "parts:slow delta blues with harmonica", "edm:ukg", "legacy:no-tracks"].map((id, i) => ({
        ...states[id], id: `s-${i}`, projectId: "p-golden", title: id, createdAt: t0, updatedAt: t0,
      })),
    };
    write(F.project, project);
  }

  const states = read<Record<string, SongState>>(F.states);
  const got: Record<string, ReturnType<typeof fingerprint>> = {};
  for (const [id, raw] of Object.entries(states)) {
    const st = normalizeSongState(raw);
    if (!st) throw new Error(`fixture ${id} did not load`);
    got[id] = fingerprint(st);
  }
  const proj = readProjectFile(read(F.project));
  for (const s of proj.songs) got[`project:${s.title}`] = fingerprint(s);

  // compatibility: valid saved edits pass through untouched; unknown ids from other builds or hand edits load instead of crashing
  let compatFails = 0;
  for (const [id, raw] of Object.entries(states)) {
    if (stable(migrateEdits(raw.edits)) !== stable(raw.edits) || stable(migrateEdits(raw.locks)) !== stable(raw.locks)) {
      compatFails++;
      console.log(`COMPAT ${id}: migrateEdits changed valid edits`);
    }
  }
  const broken: Record<string, unknown> = {
    prompt: "house",
    edits: { genres: [{ id: "vaporwave-2099", weight: 1 }, { id: "house", weight: Number.NaN }], style: { edm: "nope", ending: "explode", avoid: ["supersaws", "kazoos"], tricks: { polyrhythm: true, wobble: true } }, instruments: { kit: "tr-9000", lead: "bell" }, moods: ["dark", "spicy"], mode: "superlocrian", root: 14 },
    locks: "not an object",
    variation: "x",
    engine: 0,
  };
  try {
    const st = normalizeSongState(broken as Partial<SongState>)!;
    const { song } = songOf(st);
    identityCard(song, resolvePlan(parsePrompt(st.prompt), st.edits), st.edits);
    const e = st.edits;
    const ok = !e.genres && !e.style?.edm && !e.style?.ending && stable(e.style?.avoid) === stable(["supersaws"]) && stable(e.style?.tricks) === stable({ polyrhythm: true }) && e.instruments?.kit === undefined && e.instruments?.lead === "bell" && stable(e.moods) === stable(["dark"]) && e.mode === undefined && e.root === undefined && st.engine === 1;
    if (!ok) {
      compatFails++;
      console.log(`COMPAT broken state migrated unexpectedly: ${stable(st)}`);
    }
  } catch (err) {
    compatFails++;
    console.log(`COMPAT broken state crashed: ${(err as Error).stack}`);
  }
  const audio: Record<string, AudioPrint> = {};
  if (withAudio) {
    for (const id of AUDIO_CASES) {
      const t = Date.now();
      audio[id] = await audioPrint(normalizeSongState(states[id])!);
      console.log(`audio ${id}: ${(audio[id].frames / 22050).toFixed(1)} s rendered in ${((Date.now() - t) / 1000).toFixed(0)} s`);
    }
  }

  if (mode === "capture") {
    write(F.compose, got);
    if (withAudio) write(F.audio, audio);
    write(F.tables, tables());
    console.log(`captured ${Object.keys(got).length} cases${withAudio ? ` + ${Object.keys(audio).length} audio renders` : ""} into ${path.relative(process.cwd(), DIR)}`);
    return;
  }

  const want = read<typeof got>(F.compose);
  let sound = 0;
  let labelOnly = 0;
  const labelChanges: string[] = [];
  for (const [id, w] of Object.entries(want)) {
    const g = got[id];
    if (!g) {
      console.log(`MISSING ${id}`);
      sound++;
      continue;
    }
    const diffs = (["plan", "song", "events", "cards", "prompt"] as const).filter((k) => g[k] !== w[k]);
    if (diffs.length) {
      sound++;
      console.log(`CHANGED ${id}: ${diffs.join(", ")}\n   was ${w.summary}\n   now ${g.summary}`);
    } else if (g.label !== w.label || g.gear !== w.gear) {
      labelOnly++;
      labelChanges.push(`  ${id}: "${w.label}" -> "${g.label}"${g.gear !== w.gear ? " (gear text changed)" : ""}`);
    }
  }
  const tw = read<ReturnType<typeof tables>>(F.tables);
  const tg = tables();
  const tableDiffs = (Object.keys(tw) as (keyof typeof tw)[]).filter((k) => stable(tw[k]) !== stable(tg[k]));
  let audioDiffs = 0;
  let audioWorst = 0;
  if (withAudio) {
    const aw = read<Record<string, AudioPrint>>(F.audio);
    for (const [id, w] of Object.entries(aw)) {
      const d = audioDeviation(w, audio[id]);
      audioWorst = Math.max(audioWorst, d.max);
      if (d.max > AUDIO_TOLERANCE_DB) {
        audioDiffs++;
        console.log(`AUDIO CHANGED ${id}: ${d.max === Infinity ? "length changed" : `${d.max.toFixed(4)} dB at ${d.at.toFixed(2)} s`}`);
      }
    }
  }
  if (labelChanges.length) console.log(`label-only changes (${labelChanges.length}):\n${labelChanges.join("\n")}`);
  console.log(`\n${Object.keys(want).length} cases: ${sound} sound/structure changes, ${labelOnly} label-only changes`);
  console.log(`tables: ${tableDiffs.length ? `changed: ${tableDiffs.join(", ")}` : "identical"}`);
  console.log(`compatibility: ${compatFails ? `${compatFails} FAILURES` : "valid edits untouched, broken ids dropped without crashing"}`);
  if (withAudio) console.log(`audio: ${audioDiffs ? `${audioDiffs} renders changed` : `${AUDIO_CASES.length} renders identical`} (largest 25 ms window difference ${audioWorst.toFixed(5)} dB; tolerance ${AUDIO_TOLERANCE_DB} dB)`);
  process.exit(sound || audioDiffs || tableDiffs.length || compatFails ? 1 : 0);
}
main();
