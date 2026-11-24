export type Rand = () => number;

/** Small seeded PRNG so seed data is reproducible. */
export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T,>(rand: Rand, arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
export const between = (rand: Rand, lo: number, hi: number) => lo + rand() * (hi - lo);
export const intBetween = (rand: Rand, lo: number, hi: number) => Math.floor(between(rand, lo, hi + 1));

export function weightedPick<T extends { weight: number }>(rand: Rand, items: readonly T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rand() * total;
  for (const i of items) {
    r -= i.weight;
    if (r <= 0) return i;
  }
  return items[items.length - 1];
}
