/** Bass + chord part generators for one bar of any length (16th-step grid). Pure data. */
import type { BassStyle, BassTimbre, HarmonyInst, HarmonyRhythm } from "./genres";
import { MODES, type Chord, type ModeId } from "./theory";
import type { Rng } from "./rng";
import type { NoteEvent } from "./compose";

export type Push = (e: NoteEvent) => void;
export type Figure = { step: number; deg: number; len: number }[]; // deg = semitones from chord root (bass) or chord-tone index (harmony)
export type BassMode = BassStyle | "ostinato" | "isorhythm" | "cycle12" | "hook" | "tail" | "stop";

export function harmonyCenter(inst: HarmonyInst): number {
  return { pad: 62, supersaw: 64, piano: 60, epiano: 62, organ: 60, strumGuitar: 55, cleanGuitar: 58, distGuitar: 50, pluckArp: 64, strings: 60, brass: 58, choir: 62 }[inst];
}

export function guitarVoicing(keyRoot: number, chord: Chord): number[] {
  let r = 40 + ((((keyRoot + chord.root - 40) % 12) + 12) % 12);
  if (r > 47) r -= 12;
  if (r < 40) r += 12;
  const t = chord.tones;
  if (t.length === 3 && t[1] === 7) return [r, r + 7, r + 12, r + 19];
  const third = t[1];
  const sev = t[3] !== undefined && t[3] < 12 ? t[3] : null;
  return [r, r + 7, r + 12, r + 12 + third, sev !== null ? r + 12 + sev : r + 19, r + 24].sort((a, b) => a - b);
}

export type BassOpts = {
  t0: number;
  n: number;
  starts: number[];
  sb: (s: number) => number;
  chord: Chord;
  nextChord: Chord;
  keyRoot: number;
  mode: ModeId;
  style: BassMode;
  timbre: BassTimbre;
  octave: number;
  vel: number;
  rng: Rng;
  kickPattern: string;
  barInChord: number;
  bpc: number;
  pedal: boolean;
  short: boolean;
  chromatic: boolean;
  syncopation: number;
  absStep: number; // steps since phrase start (for cross-bar cycles)
  figure?: Figure;
  iso?: { talea: number[]; color: number[] };
  breakHits?: number[];
  barBeats: number;
};

export function bassBar(push: Push, o: BassOpts): string[] {
  const notes: string[] = [];
  const lowBase = o.octave <= 1 ? 26 : 31;
  const fold = (pc: number) => {
    let n = lowBase + ((((o.keyRoot + pc - lowBase) % 12) + 12) % 12);
    if (n > lowBase + 11) n -= 12;
    return n;
  };
  const root = o.pedal ? fold(0) : fold(o.chord.root);
  const third = root + (o.chord.tones[1] ?? 4);
  const fifth = root + (o.chord.tones[2] === 6 ? 6 : 7);
  const nextRoot = o.pedal ? fold(0) : fold(o.nextChord.root);
  const scale = MODES[o.mode].steps;
  const inst = o.timbre;
  const N = o.n;
  const st = o.starts;
  const lenMul = o.short ? 0.45 : 1;
  const n = (step: number, midi: number, dur: number, v = 1, glide?: number) => {
    if (step >= N) return;
    push({ stem: "bass", inst, t: o.t0 + o.sb(step), dur: Math.max(0.12, dur * lenMul), midi, vel: o.vel * v, glide });
  };
  switch (o.style) {
    case "stop":
      (o.breakHits ?? [0]).forEach((s, i) => n(s, root, 0.3, i === 0 ? 1 : 0.9));
      notes.push("stop-time hits");
      return notes;
    case "tail":
      n(0, root, Math.min(o.barBeats, 3.5) - 0.1, 0.9);
      return notes;
    case "root8":
      for (let s = 0; s < N; s += 2) n(s, s === N - 2 && o.rng.chance(0.3) ? fifth : root, 0.42, st.includes(s) ? 1 : 0.8);
      break;
    case "rootFifth":
      n(0, root, Math.min(1.4, (st[Math.floor(st.length / 2)] ?? 8) * 0.25 - 0.1));
      n(st[Math.floor(st.length / 2)] ?? 8, o.rng.chance(0.8) ? fifth : third, 1.4, 0.85);
      if (o.rng.chance(0.35) && N >= 12) {
        const dir = nextRoot > root ? -1 : 1;
        n(N - 4, nextRoot + dir * 2, 0.45, 0.7);
        n(N - 2, nextRoot + dir, 0.45, 0.75);
      }
      break;
    case "offbeat":
      st.forEach((s, gi) => {
        const off = s + 2;
        if (off < (st[gi + 1] ?? N)) n(off, o.rng.chance(0.15) ? root + 12 : root, 0.38, 0.9);
      });
      break;
    case "rolling":
      for (let s = 0; s < N; s++) if (!st.includes(s)) n(s, root, 0.2, s % 2 === 0 ? 0.95 : 0.75);
      break;
    case "walking": {
      const beats = Math.floor(N / 4);
      for (let i = 0; i < beats; i++) {
        let m = root;
        if (i === beats - 1) m = nextRoot + (o.rng.chance(0.5) ? -1 : 1);
        else if (i === 1) m = root + (o.rng.chance(0.5) ? third - root : scale[1]);
        else if (i > 0) m = fifth;
        n(i * 4, m, 0.95, i === 0 ? 1 : 0.85);
      }
      if (N % 4) n(N - 2, nextRoot - 1, 0.45, 0.7);
      break;
    }
    case "slide808": {
      const hits: number[] = [];
      for (let s = 0; s < N; s++) if (o.kickPattern[s] && o.kickPattern[s] !== ".") hits.push(s);
      if (!hits.length) hits.push(0, st[Math.floor(st.length / 2)] ?? 8);
      hits.forEach((s, i) => {
        const end = i + 1 < hits.length ? hits[i + 1] : N;
        const isLast = i === hits.length - 1;
        const midi = i > 0 && o.rng.chance(0.25) ? root + 12 : root;
        const glide = isLast && o.rng.chance(0.4) ? (o.rng.chance(0.5) ? 12 : nextRoot - root || 7) : undefined;
        n(s, midi, Math.max(0.3, (end - s) * 0.25 - 0.05), i === 0 ? 1 : 0.85, glide);
      });
      break;
    }
    case "sustain":
      if (o.barInChord === 0) n(0, root, o.bpc * o.barBeats - 0.1, 0.9);
      break;
    case "syncopated": {
      const pats = [[0, 3, 6, 10, 12], [0, 6, 8, 11, 14], [0, 3, 8, 10, 14]];
      const p = (N === 16 ? pats[o.rng.int(0, pats.length - 1)] : [0, ...st.slice(1).map((s) => s - 1), N - 2]).filter((s) => s >= 0 && s < N);
      p.forEach((s, i) => n(s, i === 2 && o.rng.chance(0.4) ? root + 12 : i === 3 && o.rng.chance(0.3) ? fifth : root, 0.35, i === 0 ? 1 : 0.8));
      break;
    }
    case "pulse16":
      for (let s = 0; s < N; s += 2) n(s, s % 8 === 6 && o.rng.chance(0.5) ? root + 12 : root, 0.4, st.includes(s) ? 1 : 0.75);
      break;
    case "riff":
      for (let s = 0; s < N; s += 2) {
        let m = root;
        if (s === N - 4 && o.rng.chance(0.5)) m = root + 10;
        if (s === N - 2 && o.rng.chance(0.5)) m = fifth;
        n(s, m, 0.4, st.includes(s) ? 1 : 0.8);
      }
      break;
    case "sparse":
      n(0, root, 1.6);
      n(Math.min(N - 2, 10), o.rng.chance(0.5) ? fifth : root, 0.9, 0.8);
      if (o.rng.chance(0.4)) n(N - 2, nextRoot + 2, 0.4, 0.6);
      break;
    case "ostinato":
    case "hook":
      for (const f of o.figure ?? []) n(f.step, root + f.deg, f.len * 0.25 * 0.9, f.step === 0 ? 1 : 0.85);
      break;
    case "isorhythm": {
      // talea (rhythm loop) and color (pitch loop) have different lengths and run continuously from the phrase start
      const { talea, color } = o.iso ?? { talea: [3, 3, 4, 2, 4], color: [0, 7, 10] };
      let pos = 0;
      let k = 0;
      const end = o.absStep + N;
      while (pos < end && k < 400) {
        const d = talea[k % talea.length];
        if (pos >= o.absStep) n(pos - o.absStep, root + color[k % color.length], d * 0.25 * 0.9, k % talea.length === 0 ? 1 : 0.85);
        pos += d;
        k++;
      }
      break;
    }
    case "cycle12": {
      // a 3-beat bass cell looping over the bar: realigns every 4 bars with a 4/4 drum loop (48 steps)
      const cell = [
        { s: 0, d: 0 },
        { s: 3, d: 0 },
        { s: 6, d: 7 },
        { s: 9, d: 10 },
      ];
      for (let s = 0; s < N; s++) {
        const c = (o.absStep + s) % 12;
        const hit = cell.find((x) => x.s === c);
        if (hit) n(s, root + hit.d, 0.6, c === 0 ? 1 : 0.8);
      }
      break;
    }
  }
  // syncopated anticipation of the next chord
  if (o.syncopation > 0.4 && nextRoot !== root && o.rng.chance(o.syncopation * 0.6) && !["sustain", "rolling", "isorhythm", "cycle12"].includes(o.style)) {
    n(N - 1, nextRoot, 0.3, 0.8);
    notes.push("anticipation");
  }
  // chromatic approach into the next chord
  if (o.chromatic && nextRoot !== root && o.rng.chance(0.6)) {
    n(N - 1, nextRoot - (o.rng.chance(0.7) ? 1 : -1), 0.22, 0.75);
    notes.push("chromatic approach");
  }
  return notes;
}

export type HarmonyOpts = {
  t0: number;
  n: number;
  starts: number[];
  sb: (s: number) => number;
  chord: Chord;
  keyRoot: number;
  voicing: number[];
  inst: HarmonyInst;
  rhythm: HarmonyRhythm | "ostinato" | "hemiola" | "cross" | "hookFigure" | "stop" | "gate";
  vel: number;
  rng: Rng;
  muted: boolean;
  pulse: number;
  strum: string;
  figure?: Figure;
  absStep: number;
  barBeats: number;
  breakHits?: number[];
  arpDir: number;
  displace: number; // beats
};

export function harmonyBar(push: Push, o: HarmonyOpts) {
  const { t0, sb, voicing, inst, n: N, starts: st } = o;
  const dt = o.displace;
  const at = (step: number) => t0 + sb(step) + dt;
  const chordNotes = (step: number, dur: number, v: number, variant?: number, notes = voicing) => {
    if (step >= N) return;
    for (const m of notes) push({ stem: "harmony", inst, t: at(step), dur, midi: m, vel: o.vel * v * 0.5, variant });
  };
  switch (o.rhythm) {
    case "stop":
      (o.breakHits ?? [0]).forEach((s) => chordNotes(s, 0.3, 1));
      break;
    case "strum": {
      const gv = guitarVoicing(o.keyRoot, o.chord);
      let pat = o.strum;
      if (N !== 16) {
        const p = Array.from({ length: N }, () => ".");
        st.forEach((s, gi) => {
          const next = st[gi + 1] ?? N;
          let k = 0;
          for (let x = s; x < next; x += 2) p[x] = k++ % 2 === 0 ? "D" : "U";
        });
        pat = p.join("");
      }
      for (let s = 0; s < N; s++) {
        const c = pat[s];
        if (c !== "D" && c !== "U") continue;
        let end = N;
        for (let k = s + 1; k < N; k++)
          if (pat[k] === "D" || pat[k] === "U") {
            end = k;
            break;
          }
        const notes = c === "U" ? gv.slice(-4).reverse() : gv;
        push({ stem: "harmony", inst: "strumGuitar", t: at(s), dur: Math.max(0.4, (end - s) * 0.25 + 0.3), midi: gv[0], vel: o.vel * (st.includes(s) ? 0.85 : c === "U" ? 0.5 : 0.7), variant: c === "U" ? 1 : 0, notes });
      }
      break;
    }
    case "pick": {
      const gv = guitarVoicing(o.keyRoot, o.chord);
      const order = [0, 3, 1, 4, 2, 3, 1, 4];
      for (let i = 0; i * 2 < N; i++) {
        const m = gv[order[i % order.length] % gv.length];
        push({ stem: "harmony", inst: inst === "cleanGuitar" || inst === "strumGuitar" ? "cleanGuitar" : inst, t: at(i * 2), dur: 1.2, midi: m, vel: o.vel * (st.includes(i * 2) ? 0.6 : 0.45) });
      }
      break;
    }
    case "power": {
      const r = guitarVoicing(o.keyRoot, o.chord)[0];
      const pc = [r, r + 7, r + 12];
      if (o.muted) {
        for (let s = 0; s < N; s += 2) chordNotes(s, 0.22, st.includes(s) ? 0.9 : 0.7, 1, pc);
      } else if (o.rng.chance(0.35)) chordNotes(0, o.barBeats - 0.1, 1, 0, pc);
      else for (let s = 0; s < N; s += 2) chordNotes(s, 0.45, st.includes(s) ? 1 : 0.8, 0, pc);
      break;
    }
    case "stabs": {
      const opts = [[2, 6, 10, 14], [3, 6, 11, 14], [0, 3, 6, 10]];
      const p = N === 16 ? opts[o.rng.int(0, opts.length - 1)] : st.map((s) => s + 2).filter((s) => s < N);
      p.forEach((s) => chordNotes(s, 0.35, 0.85));
      break;
    }
    case "pulse8": {
      const step = o.pulse > 72 ? 1 : 2;
      for (let s = 0; s < N; s += step) chordNotes(s, step * 0.25 * 0.8, st.includes(s) ? 0.9 : 0.65);
      break;
    }
    case "comp": {
      const opts = [[0, 6], [3, 10], [0, 7, 12], [2, 8, 14], [0, 10]];
      const p = (N === 16 ? opts[o.rng.int(0, opts.length - 1)] : [0, ...(st.length > 1 ? [st[st.length - 1] + 1] : [])]).filter((s) => s < N);
      p.forEach((s, i) => chordNotes(s, i === p.length - 1 ? 1.4 : 0.9, i === 0 ? 0.85 : 0.7));
      break;
    }
    case "arp": {
      const notes = [...voicing, voicing[0] + 12, voicing[1] + 12];
      const seq = o.arpDir === 0 ? notes : o.arpDir === 1 ? [...notes].reverse() : [...notes, ...notes.slice(1, -1).reverse()];
      const step = o.pulse > 40 ? 1 : 2;
      let k = 0;
      for (let s = 0; s < N; s += step) push({ stem: "harmony", inst, t: at(s), dur: step * 0.25 * 0.9, midi: seq[k++ % seq.length], vel: o.vel * (st.includes(s) ? 0.55 : 0.4) });
      break;
    }
    case "ostinato": {
      const tones = [...voicing, ...voicing.map((m) => m + 12)];
      for (const f of o.figure ?? []) {
        if (f.step >= N) continue;
        push({ stem: "harmony", inst, t: at(f.step), dur: f.len * 0.25 * 0.85, midi: tones[f.deg % tones.length], vel: o.vel * (f.step === 0 ? 0.6 : 0.45) });
      }
      break;
    }
    case "hookFigure":
      for (const f of o.figure ?? []) chordNotes(f.step, f.len * 0.25 * 0.9, f.step === 0 ? 0.95 : 0.85);
      break;
    case "hemiola":
      // accents every 3 eighths (6 steps) running across the bar line, restarting each phrase
      for (let s = 0; s < N; s++) if ((o.absStep + s) % 6 === 0) chordNotes(s, 1.2, 0.9);
      break;
    case "cross":
      // three evenly spaced chords per bar against the drums' pulse (tuplet timing, not swung)
      for (let k = 0; k < 3; k++)
        for (const m of voicing) push({ stem: "harmony", inst, t: t0 + (k * o.barBeats) / 3 + dt, dur: o.barBeats / 3 - 0.1, midi: m, vel: o.vel * 0.45 });
      break;
    case "gate":
      // glitchy gated chop of a held chord
      for (let s = 0; s < N; s++) if (o.rng.chance(0.62) || st.includes(s)) chordNotes(s, 0.18, st.includes(s) ? 0.9 : 0.6);
      break;
    default:
      chordNotes(0, o.barBeats - 0.1, 0.9);
  }
}
