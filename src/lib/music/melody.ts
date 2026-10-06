/** Motif-based melody that stays in the active mode and carries a recurring hook across sections. */
import type { MelodyStyle } from "./genres";
import { snapToSet, chordPitchClasses, type Chord } from "./theory";
import type { Rng } from "./rng";
import type { BarInfo } from "./groove";

export type MotifNote = { step: number; len: number; deg: number };
export type MelNote = { t: number; dur: number; midi: number; vel: number; glide?: number; response?: boolean };
export type PhraseBar = { bar: number; start: number; info: BarInfo };

export type MelodyOpts = {
  scale: number[]; // semitone steps of the melodic scale
  style: MelodyStyle;
  signature: number | null; // the mode's characteristic pitch class (relative to key)
  chromatic: boolean;
  dotted: boolean;
  syncopation: number;
  bluesBends: boolean;
};

export type SectionKind = "hook" | "verse" | "bridge" | "solo" | "fragment" | "echo" | "counter";

export function makeMelodyKit(rng: Rng, o: MelodyOpts) {
  const { scale, style } = o;
  const motifs = new Map<string, MotifNote[]>();

  const cls = (step: number, bars: PhraseBar[]) => {
    let s = step;
    for (const b of bars) {
      if (s < b.info.steps) return b.info.starts.includes(s) ? 0 : s % 2 === 0 ? 1 : 2;
      s -= b.info.steps;
    }
    return 2;
  };

  const makeMotif = (P: number, bars: PhraseBar[], density: number, lift: number, r: Rng, callOnly: number | null): MotifNote[] => {
    const T: Record<MelodyStyle, [number, number, number]> = {
      straight: [0.75, 0.55, 0.05],
      syncopated: [0.45, 0.55, 0.3],
      sparse: [0.4, 0.2, 0.06],
      arp: [0.95, 0.95, 0.35],
      long: [0.4, 0.05, 0],
      bluesy: [0.55, 0.6, 0.08],
      riff: [0.85, 0.7, 0.3],
    };
    const sy = o.syncopation;
    const onsets: number[] = [];
    const limit = callOnly ?? P;
    for (let s = 0; s < limit; s++) {
      let p: number;
      if (o.dotted && style !== "arp") p = s % 3 === 0 ? 0.8 : 0;
      else {
        const c = cls(s, bars);
        p = T[style][c];
        if (c === 0) p *= 1 - 0.35 * sy;
        else if (c === 1) p *= 1 + 0.25 * sy;
        else p = Math.min(0.6, p * (1 + 1.6 * sy) + 0.05 * sy);
        if (style === "bluesy" && s >= P / 2 && s < P * 0.85) p *= 0.35;
      }
      p = Math.min(0.97, p * (0.55 + density));
      if (r.chance(p)) onsets.push(s);
    }
    if (!onsets.length || onsets[0] > 6) onsets.unshift(r.chance(0.7) ? 0 : 2);
    const trimmed = onsets.filter((s) => s < limit - 2 || limit < 8);
    const out: MotifNote[] = [];
    let deg = lift + r.int(0, 2);
    trimmed.forEach((s, i) => {
      const nextS = i + 1 < trimmed.length ? trimmed[i + 1] : limit;
      const len = Math.max(1, Math.min(nextS - s, style === "long" ? 16 : o.dotted ? 3 : 8));
      if (i > 0) {
        const moves = style === "arp" ? [-2, 2, 2, -2, 4, -4, 1] : style === "riff" ? [0, 0, -1, 1, 2, -2, 3] : [-1, 1, -1, 1, -2, 2, 3, -3, 1, -1];
        deg += r.pick(moves);
        if (style !== "riff" && out.length >= 2 && out[out.length - 1].deg === deg && out[out.length - 2].deg === deg) deg += r.chance(0.5) ? 1 : -1;
        if (deg > lift + 5) deg -= 2;
        if (deg < lift - 4) deg += 2;
      }
      out.push({ step: s, len, deg });
    });
    // plant the mode's signature note on a weak position so the mode is audible
    if (o.signature !== null) {
      const idx = scale.findIndex((x) => x % 12 === o.signature);
      if (idx >= 0 && out.length > 2) {
        const cand = out.filter((n, i) => i > 0 && cls(n.step, bars) > 0);
        const target = cand[Math.floor(cand.length / 2)] ?? out[Math.floor(out.length / 2)];
        const oct = Math.round((target.deg - idx) / scale.length);
        target.deg = idx + oct * scale.length;
      }
    }
    return out;
  };

  const vary = (m: MotifNote[], r: Rng, endDeg: number, P: number): MotifNote[] => {
    const v = m.map((n) => ({ ...n }));
    const k = Math.min(v.length, r.int(1, 3));
    for (let i = v.length - k; i < v.length; i++) v[i].deg += r.pick([-2, -1, 1, 2]);
    if (v.length) {
      v[v.length - 1].deg = endDeg;
      v[v.length - 1].len = Math.max(v[v.length - 1].len, P - v[v.length - 1].step);
    }
    return v;
  };

  const degToMidi = (deg: number, keyRoot: number, center: number) => {
    const n = scale.length;
    let base = center - ((((center - keyRoot) % 12) + 12) % 12);
    if (center - base > 6) base += 12;
    const oct = Math.floor(deg / n);
    const idx = ((deg % n) + n) % n;
    return base + scale[idx] + oct * 12;
  };

  return {
    /** First notes of the hook motif (for intros/outros that tease it). */
    hookMotif: () => motifs.get("hook"),
    section(
      kind: SectionKind,
      phrases: PhraseBar[][],
      ctx: {
        chordAt: (bar: number) => Chord;
        keyRoot: number;
        center: number;
        responseCenter: number;
        sb: (s: number) => number;
        density: number;
        displace: number; // beats
        longNotes: boolean;
        response: boolean;
        tuplet: number;
        secEnd: number;
        seed: string;
      }
    ): MelNote[] {
      const r = rng.fork(ctx.seed);
      const density = Math.max(0.1, Math.min(1, ctx.density + (kind === "hook" ? 0.15 : kind === "solo" ? 0.3 : kind === "counter" ? -0.35 : 0)));
      const lift = kind === "hook" ? 3 : kind === "bridge" ? 1 : 0;
      const out: MelNote[] = [];
      phrases.forEach((bars, p) => {
        const P = bars.reduce((s, b) => s + b.info.steps, 0);
        const L1 = bars[0].info.steps;
        const callOnly = ctx.response && bars.length > 1 ? L1 : null;
        const key = (kind === "fragment" || kind === "echo" ? "hook" : kind === "counter" ? "counter" : kind) + ":" + P + (callOnly ? "c" : "");
        if (!motifs.has(key) || kind === "solo") motifs.set(key, makeMotif(P, bars, density, lift, r.fork("m" + key), callOnly));
        if (kind === "hook" && !motifs.has("hook")) motifs.set("hook", motifs.get(key)!);
        let motif = motifs.get(key)!;
        const pos = p % 4;
        if (kind === "solo") motif = makeMotif(P, bars, density, lift + (p % 2), r.fork("s" + p), null);
        else if (kind !== "fragment" && kind !== "echo") {
          if (pos === 1) motif = vary(motif, r.fork("v" + p), 0, callOnly ?? P);
          if (pos === 3) motif = vary(makeMotif(P, bars, density * 0.9, lift + 2, rng.fork(kind + "B" + P), callOnly), r.fork("b" + p), 0, callOnly ?? P);
        }
        if (kind === "fragment") motif = motif.slice(0, 4).map((n) => ({ ...n, len: Math.max(n.len, 6) }));
        if (kind === "echo") motif = motif.slice(-1).map((n) => ({ ...n, step: 0, len: 6 }));
        if (kind === "counter") motif = motif.filter((n) => cls(n.step, bars) === 0).map((n) => ({ ...n, len: Math.max(n.len, 6) }));
        if (ctx.longNotes) motif = motif.filter((n) => cls(n.step, bars) === 0).map((n) => ({ ...n, len: Math.max(n.len, 8) }));

        const realize = (m: MotifNote[], center: number, response: boolean, stepOffset: number) => {
          for (const n of m) {
            let s = n.step + stepOffset;
            let bi = 0;
            while (bi < bars.length && s >= bars[bi].info.steps) {
              s -= bars[bi].info.steps;
              bi++;
            }
            if (bi >= bars.length) continue;
            const b = bars[bi];
            const chord = ctx.chordAt(b.bar);
            const chordPcs = chordPitchClasses(chord);
            let midi = degToMidi(n.deg, ctx.keyRoot, center);
            const strong = b.info.starts.includes(s) && (s === 0 || n.len >= 4);
            const pc = (((midi - ctx.keyRoot) % 12) + 12) % 12;
            const clashes = chordPcs.some((c) => Math.abs(((pc - c + 18) % 12) - 6) === 5 && !chordPcs.includes(pc));
            const isSignature = o.signature !== null && pc === o.signature;
            if (strong || (clashes && !(isSignature && !strong && r.chance(0.6)))) midi = snapToSet(midi, ctx.keyRoot, chordPcs);
            while (midi > center + 12) midi -= 12;
            while (midi < center - 10) midi += 12;
            const k = out.length;
            if (style !== "riff" && k >= 2 && out[k - 1].midi === midi && out[k - 2].midi === midi) {
              const alt = snapToSet(midi + (r.chance(0.5) ? 3 : -3), ctx.keyRoot, strong ? chordPcs : scale.map((x) => x % 12));
              if (alt !== midi) midi = alt;
            }
            const t = b.start + ctx.sb(s) + ctx.displace;
            if (t >= ctx.secEnd - 0.05) continue;
            const dur = Math.max(0.2, Math.min(n.len * 0.25 * (ctx.longNotes ? 0.98 : 0.88), ctx.secEnd - t - 0.05));
            const bend = o.bluesBends && n.len >= 4 && r.chance(0.3) ? 1 : undefined;
            out.push({ t, dur, midi: bend ? midi - 1 : midi, vel: (s % 4 === 0 ? 0.85 : 0.7) * r.range(0.9, 1), glide: bend, response });
          }
        };
        realize(motif, ctx.center, false, 0);
        // call & response: a second voice answers the call in the phrase's second bar
        if (callOnly && kind !== "fragment" && kind !== "echo") {
          const shift = r.pick([2, -2, 4, -1]);
          const answer = motif.map((n) => ({ ...n, deg: n.deg + shift }));
          if (answer.length) answer[answer.length - 1].deg = 0;
          realize(answer, ctx.responseCenter, true, L1);
        }
      });
      out.sort((a, b) => a.t - b.t);
      // chromatic passing tones between whole-step neighbours
      if (o.chromatic && kind !== "fragment" && kind !== "echo") {
        const add: MelNote[] = [];
        for (let i = 0; i + 1 < out.length; i++) {
          const a = out[i];
          const b = out[i + 1];
          if (a.response !== b.response) continue;
          if (Math.abs(b.midi - a.midi) === 2 && b.t - a.t >= 0.5 && r.chance(0.5)) {
            add.push({ t: b.t - 0.25, dur: 0.22, midi: (a.midi + b.midi) / 2, vel: a.vel * 0.7, response: a.response });
            a.dur = Math.min(a.dur, b.t - 0.25 - a.t);
          }
        }
        out.push(...add);
        out.sort((a, b) => a.t - b.t);
      }
      // tuplet run into the next section
      if (ctx.tuplet > 1 && (kind === "hook" || kind === "solo" || kind === "verse") && out.length) {
        const last = out.filter((n) => !n.response).pop();
        if (last) {
          const runStart = ctx.secEnd - 1;
          const idx = scale.length;
          for (let j = 0; j < ctx.tuplet; j++) {
            const m = degToMidi(j - ctx.tuplet + idx, ctx.keyRoot, ctx.center);
            out.push({ t: runStart + j / ctx.tuplet, dur: 0.9 / ctx.tuplet, midi: m, vel: 0.55 + 0.04 * j });
          }
          for (const n of out) if (n.t < runStart && n.t + n.dur > runStart) n.dur = Math.max(0.1, runStart - n.t - 0.02);
        }
      }
      // land on a chord tone
      const main = out.filter((n) => !n.response);
      if (main.length && kind !== "echo") {
        const last = main[main.length - 1];
        const ch = ctx.chordAt(Math.max(0, phrases[phrases.length - 1]?.[0]?.bar ?? 0));
        last.midi = snapToSet(last.midi, ctx.keyRoot, [ch.root % 12, chordPitchClasses(ch)[1]]);
      }
      return out.filter((n) => n.t < ctx.secEnd - 0.05);
    },
  };
}
