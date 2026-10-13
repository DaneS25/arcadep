import { describe, expect, it } from "vitest";
import { createRng } from "./rng";

describe("createRng", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("gives different sequences for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it("stays in [0, 1) and in the asked ranges", () => {
    const rng = createRng(7);
    for (let i = 0; i < 2000; i += 1) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const r = rng.range(-2, 3);
      expect(r).toBeGreaterThanOrEqual(-2);
      expect(r).toBeLessThan(3);
      const n = rng.int(0, 4);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(4);
    }
  });

  it("picks from a list, or nothing from an empty one", () => {
    const rng = createRng(3);
    const items = ["a", "b", "c"];
    for (let i = 0; i < 50; i += 1) expect(items).toContain(rng.pick(items));
    expect(rng.pick<string>([])).toBeUndefined();
  });
});
