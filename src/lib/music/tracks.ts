/** The five song parts as user-facing tracks: name, level, pan, mute/solo, and a per-part reroll seed. */
import { STEM_IDS, type StemId } from "./compose";

export type TrackSettings = {
  name: string;
  /** dB, -36 … +6. */
  gainDb: number;
  /** -1 (left) … 1 (right). */
  pan: number;
  mute: boolean;
  solo: boolean;
  /** 0 = the song's own part; anything else = a regenerated take of that part. */
  seed: number;
};
export type Tracks = Record<StemId, TrackSettings>;
export type TrackMix = Record<StemId, { gain: number; pan: number }>;

export const TRACK_LABELS: Record<StemId, string> = { drums: "Drums", bass: "Bass", harmony: "Chords", lead: "Lead", texture: "Texture" };
export const MIN_DB = -36;
export const MAX_DB = 6;

export function defaultTracks(): Tracks {
  const t = {} as Tracks;
  for (const id of STEM_IDS) t[id] = { name: TRACK_LABELS[id], gainDb: 0, pan: 0, mute: false, solo: false, seed: 0 };
  return t;
}

/** Fills gaps so tracks saved by older versions (or hand-edited files) are always complete. */
export function normalizeTracks(t: Partial<Record<StemId, Partial<TrackSettings>>> | undefined): Tracks {
  const d = defaultTracks();
  for (const id of STEM_IDS) {
    const x = t?.[id];
    if (!x) continue;
    d[id] = {
      name: typeof x.name === "string" && x.name.trim() ? x.name.trim().slice(0, 40) : d[id].name,
      gainDb: clampNum(x.gainDb, MIN_DB, MAX_DB, 0),
      pan: clampNum(x.pan, -1, 1, 0),
      mute: !!x.mute,
      solo: !!x.solo,
      seed: Number.isFinite(x.seed) ? Math.trunc(x.seed as number) >>> 0 : 0,
    };
  }
  return d;
}

function clampNum(v: unknown, lo: number, hi: number, dflt: number) {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt;
}

/** Solo wins over mute: if any track is soloed, only soloed tracks are heard. */
export function isAudible(tracks: Tracks, id: StemId): boolean {
  const anySolo = STEM_IDS.some((s) => tracks[s].solo);
  return anySolo ? tracks[id].solo : !tracks[id].mute;
}

export function trackMix(tracks: Tracks): TrackMix {
  const m = {} as TrackMix;
  for (const id of STEM_IDS) {
    const t = tracks[id];
    m[id] = { gain: isAudible(tracks, id) ? Math.pow(10, (t.gainDb <= MIN_DB ? -120 : t.gainDb) / 20) : 0, pan: t.pan };
  }
  return m;
}

export function partSeeds(tracks: Tracks): Partial<Record<StemId, number>> {
  const s: Partial<Record<StemId, number>> = {};
  for (const id of STEM_IDS) if (tracks[id].seed) s[id] = tracks[id].seed;
  return s;
}
