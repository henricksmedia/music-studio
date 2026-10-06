/** Small music-theory toolkit: modes, roman-numeral chords, voicing. */

export const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;

export type ModeId =
  | "ionian"
  | "lydian"
  | "mixolydian"
  | "dorian"
  | "aeolian"
  | "phrygian"
  | "harmonicMinor";

export const MODES: Record<ModeId, { label: string; steps: number[]; family: "major" | "minor" }> = {
  ionian: { label: "major", steps: [0, 2, 4, 5, 7, 9, 11], family: "major" },
  lydian: { label: "lydian", steps: [0, 2, 4, 6, 7, 9, 11], family: "major" },
  mixolydian: { label: "mixolydian", steps: [0, 2, 4, 5, 7, 9, 10], family: "major" },
  dorian: { label: "dorian", steps: [0, 2, 3, 5, 7, 9, 10], family: "minor" },
  aeolian: { label: "minor", steps: [0, 2, 3, 5, 7, 8, 10], family: "minor" },
  phrygian: { label: "phrygian", steps: [0, 1, 3, 5, 7, 8, 10], family: "minor" },
  harmonicMinor: { label: "harmonic minor", steps: [0, 2, 3, 5, 7, 8, 11], family: "minor" },
};

export const MODE_IDS = Object.keys(MODES) as ModeId[];

export function midiToFreq(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function keyLabel(root: number, mode: ModeId) {
  return `${NOTE_NAMES[((root % 12) + 12) % 12]} ${MODES[mode].label}`;
}

export type Chord = {
  symbol: string; // roman numeral as written
  root: number; // pitch class offset from key root (0-11)
  tones: number[]; // semitone offsets from chord root, e.g. [0,4,7,10]
};

const NUMERALS: Record<string, number> = { i: 0, ii: 2, iii: 4, iv: 5, v: 7, vi: 9, vii: 11 };

/**
 * Parse roman numerals relative to the key root (major-scale reference).
 * Uppercase = major, lowercase = minor. Prefix b/# alters root.
 * Suffixes: 7 maj7 9 m9 add9 sus2 sus4 5 dim m7b5 6
 */
export function parseRoman(sym: string): Chord {
  const m = sym.match(/^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/);
  if (!m) return { symbol: sym, root: 0, tones: [0, 4, 7] };
  const [, acc, num, suffixRaw] = m;
  const suffix = suffixRaw.trim();
  let root = NUMERALS[num.toLowerCase()];
  if (acc === "b") root -= 1;
  if (acc === "#") root += 1;
  root = (root + 12) % 12;
  const upper = num === num.toUpperCase();
  const third = upper ? 4 : 3;
  let tones: number[] = [0, third, 7];
  switch (suffix) {
    case "7":
      tones = upper ? [0, 4, 7, 10] : [0, 3, 7, 10];
      break;
    case "maj7":
      tones = [0, third, 7, 11];
      break;
    case "9":
      tones = upper ? [0, 4, 7, 10, 14] : [0, 3, 7, 10, 14];
      break;
    case "maj9":
      tones = [0, 4, 7, 11, 14];
      break;
    case "add9":
      tones = [0, third, 7, 14];
      break;
    case "sus2":
      tones = [0, 2, 7];
      break;
    case "sus4":
      tones = [0, 5, 7];
      break;
    case "5":
      tones = [0, 7, 12];
      break;
    case "6":
      tones = [0, third, 7, 9];
      break;
    case "dim":
      tones = [0, 3, 6];
      break;
    case "m7b5":
      tones = [0, 3, 6, 10];
      break;
  }
  return { symbol: sym, root, tones };
}

/** Pitch classes (relative to key) that are "safe" over a chord in a mode. */
export function chordPitchClasses(chord: Chord): number[] {
  return chord.tones.map((t) => (chord.root + t) % 12);
}

/** Build a voicing of `chord` in key `keyRoot`, near `center` midi, with voice leading from `prev`. */
export function voiceChord(
  keyRoot: number,
  chord: Chord,
  center: number,
  prev: number[] | null,
  maxVoices = 4
): number[] {
  const pcs = chord.tones.slice(0, maxVoices).map((t) => keyRoot + chord.root + t);
  // candidate inversions: rotate and fold into range around center
  const candidates: number[][] = [];
  for (let inv = 0; inv < pcs.length; inv++) {
    for (const shift of [-12, 0, 12]) {
      const notes = pcs.map((p, i) => {
        let n = p + (i < inv ? 12 : 0) + shift;
        while (n < center - 14) n += 12;
        while (n > center + 14) n -= 12;
        return n;
      });
      notes.sort((a, b) => a - b);
      candidates.push(notes);
    }
  }
  const score = (notes: number[]) => {
    const mean = notes.reduce((s, n) => s + n, 0) / notes.length;
    let s = Math.abs(mean - center) * 0.6;
    if (prev && prev.length) {
      for (const n of notes) s += Math.min(...prev.map((p) => Math.abs(p - n))) * 0.8;
    }
    // avoid muddy close intervals at the bottom
    if (notes[1] - notes[0] < 3 && notes[0] < 55) s += 6;
    return s;
  };
  candidates.sort((a, b) => score(a) - score(b));
  return candidates[0];
}

/** Snap a midi note to the nearest note in the given pitch-class set (relative to keyRoot). */
export function snapToSet(midi: number, keyRoot: number, pcs: number[]): number {
  let best = midi;
  let bestDist = 99;
  for (let d = 0; d <= 6; d++) {
    for (const cand of [midi - d, midi + d]) {
      const pc = (((cand - keyRoot) % 12) + 12) % 12;
      if (pcs.includes(pc) && d < bestDist) {
        best = cand;
        bestDist = d;
      }
    }
    if (bestDist < 99) break;
  }
  return best;
}
