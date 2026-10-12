import { describe, expect, it } from "vitest";
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
    ]);
  });

  it("uses six-digit hex colours that CSS and three.js both accept", () => {
    for (const { value } of paletteCssVars())
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
  });
});
