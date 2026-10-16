import { describe, expect, it } from "vitest";
import {
  FLICKER,
  FLICKER_CYCLE_MS,
  dimmedSign,
  flickerLevels,
  maxFlashesPerSecond,
  seedFromText,
  slotOwner,
} from "./neonFlicker";

/** Flash start times (ms) of the whole cluster, sampled every millisecond. */
function flashStarts(
  seed: number,
  count: number,
  durationMs: number,
  startMs = 0,
): number[] {
  const starts: number[] = [];
  let wasDim = false;
  for (let t = startMs; t < startMs + durationMs; t += 1) {
    const dim = dimmedSign(t, seed, count, false) !== undefined;
    if (dim && !wasDim) starts.push(t);
    wasDim = dim;
  }
  return starts;
}

/** Most flashes in any one-second window. */
function busiestSecond(starts: readonly number[]): number {
  let best = 0;
  let from = 0;
  for (let to = 0; to < starts.length; to += 1) {
    const end = starts[to] ?? 0;
    while ((starts[from] ?? end) <= end - 1000) from += 1;
    best = Math.max(best, to - from + 1);
  }
  return best;
}

describe("neon flicker", () => {
  it("allows no more than 3 flashes a second by construction", () => {
    expect(maxFlashesPerSecond()).toBeLessThanOrEqual(3);
    expect(FLICKER.dipMs).toBeLessThan(FLICKER.slotMs);
  });

  it("never flashes more than 3 times in any one-second window, for any seed", () => {
    for (const seed of [0, 1, 42, 0xdeadbeef, seedFromText("typescript")]) {
      const starts = flashStarts(seed, 6, 60_000);
      expect(starts.length).toBeGreaterThan(0);
      expect(busiestSecond(starts)).toBeLessThanOrEqual(3);
    }
  });

  it("is deterministic for a seed, and a seed picks which sign dims, not when (task 34)", () => {
    const a = flashStarts(7, 6, 20_000);
    expect(flashStarts(7, 6, 20_000)).toEqual(a);
    // The slots belong to the scene's shared budget, so every seed dims in the same slots…
    expect(flashStarts(8, 6, 20_000)).toEqual(a);
    // …but not the same signs.
    const which = (seed: number) => a.map((t) => dimmedSign(t, seed, 6, false));
    expect(which(7)).toEqual(which(7));
    expect(which(8)).not.toEqual(which(7));
  });

  it("dims the signs only in the slots the shared budget gives them", () => {
    for (let slot = 0; slot < FLICKER.cycleSlots; slot += 1) {
      const t = slot * FLICKER.slotMs;
      const dims = dimmedSign(t, 3, 6, false) !== undefined;
      expect(dims).toBe(slotOwner(slot) === "signs");
    }
  });

  it("is gentle: signs are fully lit most of the time", () => {
    let dim = 0;
    const total = 60_000;
    for (let t = 0; t < total; t += 10)
      if (dimmedSign(t, 3, 6, false) !== undefined) dim += 1;
    expect(dim / (total / 10)).toBeLessThan(0.1);
  });

  it("dims one sign at a time, to the dim level, and keeps the others at full", () => {
    let seen = false;
    for (let t = 0; t < 30_000 && !seen; t += 5) {
      const levels = flickerLevels(t, 11, 6, false);
      expect(levels).toHaveLength(6);
      const dimmed = levels.filter((level) => level < 1);
      expect(dimmed.length).toBeLessThanOrEqual(1);
      if (dimmed.length === 1) {
        expect(dimmed[0]).toBe(FLICKER.dimLevel);
        seen = true;
      }
    }
    expect(seen).toBe(true);
  });

  it("stays steady under reduced motion", () => {
    for (let t = 0; t < 30_000; t += 7) {
      expect(dimmedSign(t, 11, 6, true)).toBeUndefined();
      expect(flickerLevels(t, 11, 6, true).every((l) => l === 1)).toBe(true);
    }
  });

  it("repeats after one cycle and handles odd input", () => {
    for (let t = 0; t < 5_000; t += 13)
      expect(dimmedSign(t + FLICKER_CYCLE_MS, 5, 6, false)).toBe(
        dimmedSign(t, 5, 6, false),
      );
    expect(dimmedSign(-1, 5, 6, false)).toBeUndefined();
    expect(dimmedSign(Number.NaN, 5, 6, false)).toBeUndefined();
    expect(dimmedSign(0, 5, 0, false)).toBeUndefined();
    expect(flickerLevels(0, 5, 0, false)).toEqual([]);
  });

  it("makes stable seeds from text", () => {
    expect(seedFromText("git")).toBe(seedFromText("git"));
    expect(seedFromText("git")).not.toBe(seedFromText("node"));
  });
});
