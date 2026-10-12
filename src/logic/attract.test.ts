import { describe, expect, it } from "vitest";
import { ATTRACT, flashesPerSecond, promptVisible } from "./attract";

describe("attract mode prompt", () => {
  it("flashes no more than 3 times a second", () => {
    expect(flashesPerSecond()).toBeLessThanOrEqual(3);
  });

  it("is on for the first half of each cycle and off for the second", () => {
    const half = ATTRACT.blinkPeriodMs / 2;
    expect(promptVisible(0, false)).toBe(true);
    expect(promptVisible(half - 1, false)).toBe(true);
    expect(promptVisible(half, false)).toBe(false);
    expect(promptVisible(ATTRACT.blinkPeriodMs, false)).toBe(true);
  });

  it("never blinks under reduced motion", () => {
    for (let ms = 0; ms < 3000; ms += 50)
      expect(promptVisible(ms, true)).toBe(true);
  });

  it("shows the prompt for odd times", () => {
    expect(promptVisible(-10, false)).toBe(true);
    expect(promptVisible(Number.NaN, false)).toBe(true);
  });
});
