import { describe, expect, it } from "vitest";
import { PALETTE, paletteCssVars } from "./palette";

describe("paletteCssVars", () => {
  it("turns every token into a --color- custom property", () => {
    expect(paletteCssVars()).toEqual([
      { name: "--color-base", value: PALETTE.base },
      { name: "--color-accent", value: PALETTE.accent },
      { name: "--color-ground", value: PALETTE.ground },
      { name: "--color-wall", value: PALETTE.wall },
      { name: "--color-trim", value: PALETTE.trim },
      { name: "--color-sidewalk", value: PALETTE.sidewalk },
    ]);
  });

  it("uses six-digit hex colours that CSS and three.js both accept", () => {
    for (const { value } of paletteCssVars())
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
  });
});
