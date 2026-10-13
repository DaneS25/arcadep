/**
 * A small seeded random number generator (mulberry32), so procedural art (the graffiti
 * tags, the posters' tilt) is the same on every load and testable.
 */

export type Rng = {
  /** A number in [0, 1). */
  next(): number;
  /** A number in [min, max). */
  range(min: number, max: number): number;
  /** An integer in [min, max). */
  int(min: number, max: number): number;
  /** One of `items`, or undefined when there are none. */
  pick<T>(items: readonly T[]): T | undefined;
};

export function createRng(seed: number): Rng {
  let state = Math.trunc(seed) >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) =>
      Math.min(max - 1, Math.floor(min + next() * (max - min))),
    pick: (items) =>
      items.length === 0 ? undefined : items[Math.floor(next() * items.length)],
  };
}
