/** Rhythm engine helpers: meters, groupings, drum patterns for any bar length, clave, tuplets. */
import type { DrumPattern } from "./genres";

export type BarInfo = { steps: number; starts: number[] }; // starts = group start steps (16ths)

/** Group starts for a bar of `steps` 16ths, using an eighth-note grouping if it fits. */
export function barInfo(steps: number, grouping: number[] | null): BarInfo {
  let g = grouping && grouping.reduce((s, x) => s + x, 0) * 2 === steps ? grouping : null;
  if (!g) {
    if (steps === 16) g = [2, 2, 2, 2];
    else if (steps === 12) g = [2, 2, 2];
    else if (steps === 14) g = [2, 2, 3];
    else if (steps === 20) g = [3, 3, 2, 2];
    else if (steps === 10) g = [3, 2];
    else g = Array.from({ length: Math.floor(steps / 4) }, () => 2).concat(steps % 4 ? [(steps % 4) / 2] : []);
  }
  const starts: number[] = [];
  let s = 0;
  for (const x of g) {
    starts.push(s);
    s += x * 2;
  }
  return { steps, starts };
}

export type KitFlavor = {
  fourFloor: boolean;
  hatStep: 1 | 2 | 4;
  openOff: boolean;
  snareKey: "snare" | "clap";
  halftime: boolean;
  shaker: boolean;
  ride: boolean;
  rolls: boolean;
};

const hits = (s?: string) => (s ? s.split("").map((c, i) => (c !== "." ? i : -1)).filter((i) => i >= 0) : []);

export function flavorOf(p: DrumPattern, halfTime = false): KitFlavor {
  const k = hits(p.kick);
  const hat = hits(p.hat);
  const sn = hits(p.snare ?? p.clap);
  return {
    fourFloor: [0, 4, 8, 12].every((i) => k.includes(i)),
    hatStep: hat.length >= 12 ? 1 : hat.length >= 6 ? 2 : 4,
    openOff: !!p.open && p.open[2] !== ".",
    snareKey: p.snare ? "snare" : "clap",
    halftime: halfTime || (sn.includes(8) && !sn.includes(4) && !sn.includes(12)),
    shaker: !!p.shaker,
    ride: !!p.ride && !p.hat,
    rolls: !!p.hat && p.hat.includes("r"),
  };
}

const blank = (n: number) => Array.from({ length: n }, () => ".");

/** Build a coherent drum pattern for any bar length from a kit flavor. The downbeat always gets the accented kick. */
export function generatePattern(info: BarInfo, fl: KitFlavor, opts: { broken?: boolean; halftime?: boolean; backbeat?: boolean } = {}): DrumPattern {
  const n = info.steps;
  const st = info.starts;
  const kick = blank(n);
  const sn = blank(n);
  const hat = blank(n);
  const open = blank(n);
  const shaker = blank(n);
  const halftime = opts.halftime ?? fl.halftime;
  kick[0] = "X";
  if (opts.broken) {
    // breakbeat logic: kick dodges the grid, snare lands on the 2nd group and late in the bar
    const lastStart = st[st.length - 1];
    kick[Math.max(1, (st[1] ?? 4) + 3) % n] = "x";
    if (lastStart - 2 > 0) kick[lastStart - 2] = "x";
    sn[st[1] ?? Math.floor(n / 4)] = "x";
    const late = Math.min(n - 1, lastStart + 2);
    sn[late] = "x";
    if (late - 3 > (st[1] ?? 4)) sn[late - 3] = "g";
  } else {
    st.forEach((s, gi) => {
      if (fl.fourFloor || gi % 2 === 0) kick[s] = gi === 0 ? "X" : "x";
    });
    if (halftime) {
      const mid = st.reduce((best, s) => (Math.abs(s - n / 2) < Math.abs(best - n / 2) ? s : best), st[1] ?? n / 2);
      sn[mid] = "x";
    } else {
      st.forEach((s, gi) => {
        if (gi % 2 === 1 || (opts.backbeat && st.length === 3 && gi === 2)) sn[s] = "x";
      });
      if (st.length === 1) sn[Math.floor(n / 2)] = "x";
    }
  }
  for (let s = 0; s < n; s += fl.hatStep) hat[s] = st.includes(s) ? "x" : "g";
  if (fl.openOff) {
    st.forEach((s, gi) => {
      const next = st[gi + 1] ?? n;
      if (s + 2 < next) {
        open[s + 2] = "x";
        hat[s + 2] = ".";
      }
    });
  }
  if (fl.shaker) for (let s = 0; s < n; s += 2) shaker[s + 1 < n ? s + 1 : s] = "g";
  const out: DrumPattern = { kick: kick.join("") };
  out[fl.snareKey] = sn.join("");
  if (fl.ride) out.ride = hat.join("");
  else out.hat = hat.join("");
  if (fl.openOff) out.open = open.join("");
  if (fl.shaker) out.shaker = shaker.join("");
  return out;
}

/** Explicit 4/4 broken-time patterns (2-step and breakbeat). */
export const BROKEN_44: DrumPattern[] = [
  { kick: "X.........x.....", snare: "....x.......x...", hat: "g.g.g.g.g.g.g.g.", rim: "..g.....g.....g." },
  { kick: "X.x.......xx....", snare: "....x..g.g..x..g", hat: "x.x.x.x.x.x.x.x." },
  { kick: "X......x..x.....", snare: "....x......g..x.", hat: "g.gxg.g.g.gxg.g." },
];

/** Re-accent a 4/4 pattern's kick to an additive grouping (e.g. 3+3+2 → kick on 0, 6, 12). */
export function applyGroupingToKick(p: DrumPattern, info: BarInfo, keepFloor: boolean): DrumPattern {
  if (keepFloor) return p;
  const k = blank(info.steps);
  info.starts.forEach((s, i) => (k[s] = i === 0 ? "X" : "x"));
  return { ...p, kick: k.join("") };
}

/** Clave / bell hits for a bar (16ths). `pairIndex` 0/1 = first/second bar of the 2-bar clave. */
export function claveHits(steps: number, pairIndex: number, dir: "3-2" | "2-3", info: BarInfo): number[] {
  const threeSide = (pairIndex === 0) === (dir === "3-2");
  if (steps === 16) return threeSide ? [0, 6, 12] : [4, 8];
  if (steps === 12) return pairIndex === 0 ? [0, 4, 8, 10] : [2, 6, 10]; // 12/8 bell
  return threeSide ? info.starts.slice(0, 3) : info.starts.slice(1).map((s) => Math.min(steps - 1, s + 2));
}

/** N evenly spaced hit positions (in beats) across a span of `beats`. */
export function evenHits(n: number, beats: number): number[] {
  return Array.from({ length: n }, (_, i) => (i * beats) / n);
}

/** Swing: offset (in beats) for a 16th step. grid 8 swings the 8th off-beats, grid 16 the 16th off-beats. */
export function swingBeat(step: number, swing: number, grid: 8 | 16): number {
  const beat = Math.floor(step / 4);
  const pos = ((step % 4) + 4) % 4;
  if (grid === 16) return step * 0.25 + (step % 2 === 1 ? swing / 12 : 0);
  const map = [0, 0.25 + swing / 12, 0.5 + swing / 6, 0.75 + swing / 12];
  return beat + map[pos];
}
