import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { PALETTE, paletteCssVars } from "./palette";

describe("paletteCssVars", () => {
  it("turns every token into a --color- custom property", () => {
    expect(paletteCssVars()).toEqual([
      { name: "--color-base", value: PALETTE.base },
      { name: "--color-accent", value: PALETTE.accent },
      { name: "--color-cyan", value: PALETTE.cyan },
      { name: "--color-amber", value: PALETTE.amber },
      { name: "--color-panel", value: PALETTE.panel },
      { name: "--color-text", value: PALETTE.text },
      { name: "--color-muted", value: PALETTE.muted },
      { name: "--color-ground", value: PALETTE.ground },
      { name: "--color-wall", value: PALETTE.wall },
      { name: "--color-trim", value: PALETTE.trim },
      { name: "--color-sidewalk", value: PALETTE.sidewalk },
      { name: "--color-cabinet", value: PALETTE.cabinet },
      { name: "--color-signPlate", value: PALETTE.signPlate },
      { name: "--color-posterPaper", value: PALETTE.posterPaper },
      { name: "--color-terminal", value: PALETTE.terminal },
    ]);
  });

  it("uses six-digit hex colours that CSS and three.js both accept", () => {
    for (const { value } of paletteCssVars())
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("poster paper", () => {
  it("keeps the posters' ink readable: title AA, tags at least 3:1", () => {
    expect(contrastRatio(PALETTE.base, PALETTE.posterPaper)).toBeGreaterThan(
      4.5,
    );
    expect(contrastRatio(PALETTE.trim, PALETTE.posterPaper)).toBeGreaterThan(3);
  });
});
