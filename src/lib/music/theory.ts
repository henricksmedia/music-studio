/** Small music-theory toolkit: modes, roman-numeral chords, voicing. */

export const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;

export type ModeId =
  | "ionian"
  | "lydian"
  | "mixolydian"
  | "dorian"
  | "aeolian"
  | "phrygian"
  | "locrian"
  | "harmonicMinor";

export const MODES: Record<ModeId, { label: string; steps: number[]; family: "major" | "minor" }> = {
  ionian: { label: "major", steps: [0, 2, 4, 5, 7, 9, 11], family: "major" },
  lydian: { label: "lydian", steps: [0, 2, 4, 6, 7, 9, 11], family: "major" },
  mixolydian: { label: "mixolydian", steps: [0, 2, 4, 5, 7, 9, 10], family: "major" },
  dorian: { label: "dorian", steps: [0, 2, 3, 5, 7, 9, 10], family: "minor" },
  aeolian: { label: "minor", steps: [0, 2, 3, 5, 7, 8, 10], family: "minor" },
  phrygian: { label: "phrygian", steps: [0, 1, 3, 5, 7, 8, 10], family: "minor" },
  locrian: { label: "locrian", steps: [0, 1, 3, 5, 6, 8, 10], family: "minor" },
  harmonicMinor: { label: "harmonic minor", steps: [0, 2, 3, 5, 7, 8, 11], family: "minor" },
};

export const MODE_IDS = Object.keys(MODES) as ModeId[];

/** Plain-language names from the cheat sheet. */
export const MODE_INFO: Record<ModeId, { name: string; plain: string; signature: number | null }> = {
  ionian: { name: "Ionian (major)", plain: "Bright, happy home base.", signature: null },
  aeolian: { name: "Aeolian (minor)", plain: "Dark, serious, a little sad.", signature: null },
  dorian: { name: "Dorian", plain: "Minor with a soulful lift (that raised 6th).", signature: 9 },
  phrygian: { name: "Phrygian", plain: "Exotic and tense; the flat 2nd sounds Spanish or metal.", signature: 1 },
  mixolydian: { name: "Mixolydian", plain: "Bright but bluesy; rock swagger from the flat 7th.", signature: 10 },
  lydian: { name: "Lydian", plain: "Dreamy, floating, cinematic wonder (raised 4th).", signature: 6 },
  locrian: { name: "Locrian", plain: "Unstable and uneasy; it never feels settled.", signature: 6 },
  harmonicMinor: { name: "Harmonic minor", plain: "Dramatic minor with an exotic leading tone.", signature: 11 },
};

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
    case "dim7":
      tones = [0, 3, 6, 9];
      break;
    case "+":
    case "aug":
      tones = [0, 4, 8];
      break;
    case "sus":
      tones = [0, 5, 7];
      break;
    case "m9":
      tones = [0, 3, 7, 10, 14];
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

/** Diatonic triad (as roman numeral) on a scale degree (1-7) of a mode. */
export function diatonicRoman(mode: ModeId, degree: number): string {
  const st = MODES[mode].steps;
  const i = (((degree - 1) % 7) + 7) % 7;
  const root = st[i];
  const third = (st[(i + 2) % 7] - root + 12) % 12;
  const fifth = (st[(i + 4) % 7] - root + 12) % 12;
  const names = ["I", "bII", "II", "bIII", "III", "IV", "#IV", "V", "bVI", "VI", "bVII", "VII"];
  let n = names[root];
  const acc = n.match(/^[b#]/)?.[0] ?? "";
  let num = n.replace(/^[b#]/, "");
  if (third === 3) num = num.toLowerCase();
  n = acc + num;
  if (fifth === 6) return n.toLowerCase() + "dim";
  if (fifth === 8) return n + "+";
  return n;
}

/** Re-spell a roman-numeral chord so its quality is diatonic to `mode` (keeps 7ths/9ths); roots outside the mode are kept. */
export function conformToMode(sym: string, mode: ModeId): string {
  const m = sym.match(/^([b#]?)([ivIV]+)(.*)$/);
  if (!m) return sym;
  const root = parseRoman(sym).root;
  const idx = MODES[mode].steps.indexOf(root);
  if (idx < 0) return sym;
  const dia = diatonicRoman(mode, idx + 1);
  if (/dim|\+/.test(dia)) return dia;
  let ext = m[3].replace(/^(dim|\+|°|m(?!aj))/, "");
  const minor = dia.replace(/^[b#]/, "")[0] === dia.replace(/^[b#]/, "")[0].toLowerCase();
  // diatonic seventh: major 7th → "maj7", minor 7th → "7"
  const st = MODES[mode].steps;
  const sev = (st[(idx + 6) % 7] - root + 12) % 12;
  const ext7 = ext.match(/^(maj)?(7|9)(.*)$/);
  if (ext7) ext = (sev === 11 && !minor ? "maj" : "") + ext7[2] + ext7[3];
  if (minor && ext.startsWith("maj")) ext = ext.slice(3);
  return dia + ext;
}

export type ChordColorId = "auto" | "plain" | "sus" | "sevenths" | "rich" | "power" | "diminished" | "augmented";

/** Re-color a roman-numeral chord. `pos`/`len` let colors like diminished/augmented target the turnaround chord. */
export function colorChord(sym: string, color: ChordColorId, pos: number, len: number): string {
  if (color === "auto") return sym;
  const m = sym.match(/^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/);
  if (!m) return sym;
  const [, acc, num, suf] = m;
  const isDim = /dim|m7b5/.test(suf);
  const upper = num === num.toUpperCase();
  const base = acc + num;
  const rootPc = parseRoman(base).root;
  switch (color) {
    case "plain":
      return isDim ? base + "dim" : base;
    case "sus":
      if (isDim) return base + "dim";
      return pos % 2 === 0 ? base + "sus2" : base + "sus4";
    case "sevenths":
      if (isDim) return base + "m7b5";
      return upper ? base + (rootPc === 0 || rootPc === 5 || rootPc === 8 || rootPc === 3 ? "maj7" : "7") : base + "7";
    case "rich":
      if (isDim) return base + "m7b5";
      return upper ? base + (rootPc === 7 || rootPc === 10 ? "9" : "maj9") : base + "9";
    case "power":
      return base + "5";
    case "diminished":
      // the turnaround chord becomes a diminished 7th a half-step under the next chord: classic film tension
      return pos === len - 1 ? "viidim7" : isDim ? base + "dim" : base;
    case "augmented":
      return pos === len - 1 ? (upper ? base : base.toUpperCase()) + "+" : isDim ? base + "dim" : base;
  }
  return sym;
}
