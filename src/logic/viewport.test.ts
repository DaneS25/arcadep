import { describe, expect, it } from "vitest";
import {
  capPixelRatio,
  computeViewport,
  MAX_PIXEL_RATIO,
  viewportChanged,
} from "./viewport";

describe("capPixelRatio", () => {
  it("keeps a ratio at or below the cap", () => {
    expect(capPixelRatio(1.5)).toBe(1.5);
  });

  it("caps a high-density ratio", () => {
    expect(capPixelRatio(3)).toBe(MAX_PIXEL_RATIO);
  });

  it("falls back to 1 for zero, negative or non-finite ratios", () => {
    expect(capPixelRatio(0)).toBe(1);
    expect(capPixelRatio(-2)).toBe(1);
    expect(capPixelRatio(Number.NaN)).toBe(1);
  });
});

describe("computeViewport", () => {
  it("uses the client size and its aspect ratio", () => {
    expect(computeViewport(1920, 1080, 1)).toEqual({
      width: 1920,
      height: 1080,
      pixelRatio: 1,
      aspect: 1920 / 1080,
    });
  });

  it("rounds fractional client sizes down", () => {
    const viewport = computeViewport(800.6, 600.4, 1);
    expect([viewport.width, viewport.height]).toEqual([800, 600]);
  });

  it("treats a collapsed canvas as 1x1 so the aspect stays finite", () => {
    const viewport = computeViewport(0, 0, 1);
    expect(viewport).toMatchObject({ width: 1, height: 1, aspect: 1 });
  });

  it("caps the pixel ratio", () => {
    expect(computeViewport(100, 100, 4).pixelRatio).toBe(MAX_PIXEL_RATIO);
  });
});

describe("viewportChanged", () => {
  const base = computeViewport(1280, 720, 1);

  it("reports a change when nothing was applied yet", () => {
    expect(viewportChanged(undefined, base)).toBe(true);
  });

  it("reports no change for the same size and ratio", () => {
    expect(viewportChanged(base, computeViewport(1280, 720, 1))).toBe(false);
  });

  it("reports a change when the size changes", () => {
    expect(viewportChanged(base, computeViewport(1280, 700, 1))).toBe(true);
  });

  it("reports a change when the pixel ratio changes", () => {
    expect(viewportChanged(base, computeViewport(1280, 720, 2))).toBe(true);
  });
});
