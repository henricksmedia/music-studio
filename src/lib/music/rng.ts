/** Deterministic randomness so a prompt + variation always yields the same song. */

export function hashString(s: string, seed = 2166136261): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // final avalanche
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export type Rng = {
  (): number;
  int: (min: number, max: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  weighted: <T>(items: readonly (readonly [T, number])[]) => T;
  chance: (p: number) => boolean;
  range: (min: number, max: number) => number;
  fork: (label: string) => Rng;
};

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = next as Rng;
  rng.int = (min, max) => min + Math.floor(next() * (max - min + 1));
  rng.pick = (arr) => arr[Math.floor(next() * arr.length)];
  rng.weighted = (items) => {
    const total = items.reduce((s, [, w]) => s + Math.max(0, w), 0);
    if (total <= 0) return items[0][0];
    let r = next() * total;
    for (const [v, w] of items) {
      r -= Math.max(0, w);
      if (r <= 0) return v;
    }
    return items[items.length - 1][0];
  };
  rng.chance = (p) => next() < p;
  rng.range = (min, max) => min + next() * (max - min);
  rng.fork = (label) => makeRng(hashString(label, seed));
  return rng;
}
