import { describe, expect, it } from "vitest";
import {
  AA_NON_TEXT,
  AA_TEXT,
  contrastRatio,
  relativeLuminance,
} from "./contrast";
import { PALETTE } from "./palette";

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBe(1);
  });

  it("rejects anything that isn't #rrggbb", () => {
    expect(relativeLuminance("#fff")).toBeUndefined();
    expect(relativeLuminance("red")).toBeUndefined();
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white, either way round", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  it("is 1 for the same colour", () => {
    expect(contrastRatio("#ff2a3d", "#ff2a3d")).toBe(1);
  });

  it("matches a known value (#767676 on white is about 4.54)", () => {
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });

  it("is undefined for a bad colour", () => {
    expect(contrastRatio("#000000", "nope")).toBeUndefined();
  });
});

describe("overlay palette meets WCAG 2.2 AA", () => {
  const surfaces = { base: PALETTE.base, panel: PALETTE.panel };

  it.each(Object.entries(surfaces))("text tokens on %s", (_name, surface) => {
    for (const ink of [
      PALETTE.text,
      PALETTE.muted,
      PALETTE.accent,
      PALETTE.cyan,
      PALETTE.violet,
    ]) {
      expect(contrastRatio(ink, surface)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("the focus ring (cyan) stands out from both surfaces", () => {
    for (const surface of Object.values(surfaces)) {
      expect(contrastRatio(PALETTE.cyan, surface)).toBeGreaterThanOrEqual(
        AA_NON_TEXT,
      );
    }
  });

  it("panel text on an inverted (hovered) cyan button", () => {
    expect(contrastRatio(PALETTE.panel, PALETTE.cyan)).toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  });
});
