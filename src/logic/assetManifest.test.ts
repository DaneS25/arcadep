import { describe, expect, it } from "vitest";
import {
  FONTS,
  TEXTURE_FALLBACK_COLORS,
  TEXTURE_SLOTS,
  fontCssVars,
  fontFaceSource,
  fontFileStem,
  fontStack,
  fontUrls,
  textureUrl,
} from "./assetManifest";

describe("textureUrl", () => {
  it("points at the renamed ambientCG map inside the slot's folder", () => {
    expect(textureUrl("brick", "color")).toBe(
      "/assets/textures/brick/Color.jpg",
    );
    expect(textureUrl("asphalt", "normal")).toBe(
      "/assets/textures/asphalt/NormalGL.jpg",
    );
    expect(textureUrl("metal", "roughness")).toBe(
      "/assets/textures/metal/Roughness.jpg",
    );
  });
});

describe("TEXTURE_FALLBACK_COLORS", () => {
  it("has a six-digit hex colour for every slot", () => {
    for (const slot of TEXTURE_SLOTS)
      expect(TEXTURE_FALLBACK_COLORS[slot]).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("font files", () => {
  it("drops spaces from the family to get the file name", () => {
    expect(fontFileStem(FONTS.mono)).toBe("ShareTechMono");
  });

  it("tries woff2 before ttf", () => {
    expect(fontUrls(FONTS.marker)).toEqual([
      "/assets/fonts/PermanentMarker.woff2",
      "/assets/fonts/PermanentMarker.ttf",
    ]);
  });

  it("builds a FontFace source listing both files with their formats", () => {
    expect(fontFaceSource(FONTS.neon)).toBe(
      'url("/assets/fonts/Orbitron.woff2") format("woff2"), url("/assets/fonts/Orbitron.ttf") format("truetype")',
    );
  });
});

describe("fontStack", () => {
  it("puts the downloaded family first when it loaded", () => {
    expect(fontStack(FONTS.neon, true)).toBe(
      '"Orbitron", "Arial Black", sans-serif',
    );
  });

  it("uses only the system fallback when the font is missing", () => {
    expect(fontStack(FONTS.neon, false)).toBe('"Arial Black", sans-serif');
  });
});

describe("fontCssVars", () => {
  it("turns every font role into a --font- custom property", () => {
    expect(fontCssVars()).toEqual([
      { name: "--font-neon", value: fontStack(FONTS.neon, true) },
      { name: "--font-mono", value: fontStack(FONTS.mono, true) },
      { name: "--font-marker", value: fontStack(FONTS.marker, true) },
    ]);
  });
});
