import { describe, expect, it } from "vitest";
import { clampDeltaMs, createFrameClock, MAX_FRAME_DT_MS } from "./frameClock";

describe("clampDeltaMs", () => {
  it("keeps a normal frame delta unchanged", () => {
    expect(clampDeltaMs(16.7)).toBe(16.7);
  });

  it("caps a long delta at the maximum", () => {
    expect(clampDeltaMs(5000)).toBe(MAX_FRAME_DT_MS);
  });

  it("turns a negative delta into zero", () => {
    expect(clampDeltaMs(-10)).toBe(0);
  });

  it("turns a non-finite delta into zero", () => {
    expect(clampDeltaMs(Number.NaN)).toBe(0);
    expect(clampDeltaMs(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("uses a custom maximum when given", () => {
    expect(clampDeltaMs(40, 33)).toBe(33);
  });
});

describe("createFrameClock", () => {
  it("returns zero on the first tick", () => {
    const clock = createFrameClock();
    expect(clock.tick(1234)).toBe(0);
  });

  it("returns the time since the previous tick", () => {
    const clock = createFrameClock();
    clock.tick(1000);
    expect(clock.tick(1016)).toBe(16);
  });

  it("clamps the jump after a tab switch", () => {
    const clock = createFrameClock();
    clock.tick(1000);
    expect(clock.tick(61_000)).toBe(MAX_FRAME_DT_MS);
  });

  it("measures from the latest tick even after clamping", () => {
    const clock = createFrameClock();
    clock.tick(0);
    clock.tick(10_000);
    expect(clock.tick(10_020)).toBe(20);
  });

  it("returns zero on the next tick after a reset", () => {
    const clock = createFrameClock();
    clock.tick(0);
    clock.reset();
    expect(clock.tick(500)).toBe(0);
  });
});
