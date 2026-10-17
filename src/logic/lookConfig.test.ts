import { describe, expect, it } from "vitest";
import { CAMERA } from "./cameraOrbit";
import { relativeLuminance } from "./contrast";
import {
  BLOOM,
  CABINET_LOOK,
  DETAILS_LOOK,
  ENVIRONMENT_PANELS,
  FOG,
  GRAFFITI_LOOK,
  AMBIENT_LIGHTS,
  ENVIRONMENT,
  NEON_BLOOM_LUMA,
  NEON_LIGHTS,
  SIGNS_LOOK,
  TONE_MAPPING,
  SURFACES,
  TERMINAL_LOOK,
  WINDOW_LOOK,
  WISPS_LOOK,
  bloomLuma,
  fogFactor,
  neonIntensity,
  surfaceMaterialParams,
} from "./lookConfig";
import { PALETTE } from "./palette";

describe("surfaceMaterialParams", () => {
  const look = SURFACES.street;

  it("uses the plain fallback colour and no maps when the colour map is missing", () => {
    const params = surfaceMaterialParams(look, {
      color: null,
      normal: null,
      roughness: null,
    });
    expect(params).toEqual({
      color: PALETTE.ground,
      map: null,
      normalMap: null,
      roughnessMap: null,
      roughness: look.roughness,
      metalness: look.metalness,
      envMapIntensity: look.envMapIntensity,
    });
  });

  it("uses the tinted maps when the colour map loaded", () => {
    const params = surfaceMaterialParams(look, {
      color: "c",
      normal: "n",
      roughness: null,
    });
    expect(params.color).toBe(look.tint);
    expect(params.map).toBe("c");
    expect(params.normalMap).toBe("n");
    expect(params.roughnessMap).toBeNull();
  });
});

describe("SURFACES", () => {
  it("keeps every value in its physical range and tiles at a real size", () => {
    for (const look of Object.values(SURFACES)) {
      expect(look.roughness).toBeGreaterThanOrEqual(0);
      expect(look.roughness).toBeLessThanOrEqual(1);
      expect(look.metalness).toBeGreaterThanOrEqual(0);
      expect(look.metalness).toBeLessThanOrEqual(1);
      expect(look.tileM).toBeGreaterThan(0.5);
      expect(look.tint).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("makes the street the wettest (smoothest) surface", () => {
    const { street, ...rest } = SURFACES;
    for (const look of Object.values(rest))
      expect(street.roughness).toBeLessThan(look.roughness);
  });
});

describe("fogFactor", () => {
  it("is 0 at the camera and grows towards 1 with distance", () => {
    expect(fogFactor(FOG.density, 0)).toBe(0);
    expect(fogFactor(FOG.density, 20)).toBeLessThan(fogFactor(FOG.density, 40));
    expect(fogFactor(FOG.density, 1e6)).toBeCloseTo(1);
  });

  it("treats negative inputs as zero", () => {
    expect(fogFactor(-1, 10)).toBe(0);
    expect(fogFactor(0.1, -10)).toBe(0);
  });

  it("leaves the building readable from the farthest camera but hides the street's edge", () => {
    expect(fogFactor(FOG.density, CAMERA.maxDistanceM)).toBeLessThan(0.5);
    // The street ends 40 m from the centre, so from the farthest camera its edge is mostly fogged.
    expect(fogFactor(FOG.density, CAMERA.maxDistanceM + 40)).toBeGreaterThan(
      0.6,
    );
  });
});

describe("neon and bloom", () => {
  it("drives every neon colour just past the bloom threshold, equally", () => {
    expect(BLOOM.threshold).toBeGreaterThan(0.5);
    expect(BLOOM.threshold).toBeLessThan(1);
    expect(NEON_BLOOM_LUMA).toBeGreaterThan(BLOOM.threshold);
    expect(NEON_BLOOM_LUMA).toBeLessThan(BLOOM.threshold * 1.25);
    for (const hex of [PALETTE.accent, PALETTE.cyan, PALETTE.purple]) {
      const luma = (bloomLuma(hex) ?? Number.NaN) * neonIntensity(hex);
      expect(luma).toBeCloseTo(NEON_BLOOM_LUMA, 6);
    }
    // Darker than the task 9 look, where red tubes were 3 times their colour.
    expect(neonIntensity(PALETTE.accent)).toBeLessThan(3);
  });

  it("weighs colours as the bloom pass does", () => {
    expect(bloomLuma("#000000")).toBe(0);
    expect(bloomLuma("#ffffff")).toBeCloseTo(1, 6);
    expect(bloomLuma("#ff0000")).toBeCloseTo(0.299, 6);
    expect(bloomLuma("red")).toBeUndefined();
    expect(neonIntensity("#000000")).toBe(1);
  });

  it("colours the lights and environment panels with neon tokens only", () => {
    const neon = new Set(["accent", "cyan", "purple"]);
    for (const light of NEON_LIGHTS) expect(neon.has(light.color)).toBe(true);
    for (const panel of ENVIRONMENT_PANELS)
      expect(neon.has(panel.color)).toBe(true);
  });

  it("keeps the point-light count small", () => {
    expect(NEON_LIGHTS.length).toBeLessThanOrEqual(4);
  });
});

describe("CABINET_LOOK", () => {
  it("lets the cabinet's bright text bloom but not its dark glass", () => {
    expect(CABINET_LOOK.faceIntensity).toBeGreaterThan(BLOOM.threshold);
    // The screen's darkest colour (the base) times the intensity stays far below.
    expect(CABINET_LOOK.faceIntensity * 0.03).toBeLessThan(BLOOM.threshold);
  });

  it("keeps the highlight a glow, not a light source", () => {
    expect(CABINET_LOOK.highlightEmissive).toBeGreaterThan(0);
    expect(CABINET_LOOK.highlightEmissive).toBeLessThan(1);
  });
});

describe("GRAFFITI_LOOK", () => {
  it("keeps the paint's glow under the bloom threshold, brighter when lit", () => {
    expect(GRAFFITI_LOOK.emissiveIntensity).toBeLessThan(BLOOM.threshold);
    expect(GRAFFITI_LOOK.litEmissiveIntensity).toBeLessThan(BLOOM.threshold);
    expect(GRAFFITI_LOOK.litEmissiveIntensity).toBeGreaterThan(
      GRAFFITI_LOOK.emissiveIntensity,
    );
    expect(GRAFFITI_LOOK.alphaTest).toBeGreaterThan(0);
    expect(GRAFFITI_LOOK.alphaTest).toBeLessThan(0.1);
  });
});

describe("TERMINAL_LOOK", () => {
  it("makes the screen text bloom but never the housing, lit or not", () => {
    const glow = (hex: string, intensity: number): number =>
      (relativeLuminance(hex) ?? Number.NaN) * intensity;
    expect(glow(PALETTE.cyan, TERMINAL_LOOK.emissiveIntensity)).toBeGreaterThan(
      BLOOM.threshold,
    );
    expect(
      glow(PALETTE.terminal, TERMINAL_LOOK.litEmissiveIntensity),
    ).toBeLessThan(BLOOM.threshold / 10);
    expect(TERMINAL_LOOK.litEmissiveIntensity).toBeGreaterThan(
      TERMINAL_LOOK.emissiveIntensity,
    );
  });
});

describe("DETAILS_LOOK", () => {
  const glow = (hex: string): number =>
    (relativeLuminance(hex) ?? Number.NaN) * DETAILS_LOOK.emissiveIntensity;

  it("makes the signs' letters bloom, but never the puddles' reflection", () => {
    expect(glow(DETAILS_LOOK.signCore)).toBeGreaterThan(BLOOM.threshold);
    for (const hex of DETAILS_LOOK.puddleGlow)
      expect(glow(hex)).toBeLessThan(BLOOM.threshold / 10);
  });

  it("uses the metal texture slot and shades sign faces black under their glow", () => {
    expect(DETAILS_LOOK.surface.slot).toBe("metal");
    expect(DETAILS_LOOK.shades.face).toBe(0);
    expect(DETAILS_LOOK.shades.metal).toBe(1);
    for (const [kind, shade] of Object.entries(DETAILS_LOOK.shades)) {
      expect(shade).toBeGreaterThanOrEqual(0);
      // The wires are a touch lighter than the metal so they catch the neon (task 29);
      // `wireLayout.test.ts` keeps them under 2.
      if (kind !== "wire") expect(shade).toBeLessThanOrEqual(1);
    }
  });
});

describe("merged sign plates", () => {
  it("keep the plain plate colour inside the details mesh", () => {
    const plate = relativeLuminance(PALETTE.signPlate) ?? Number.NaN;
    const prop = relativeLuminance(PALETTE.prop) ?? Number.NaN;
    expect(DETAILS_LOOK.shades.signPlate).toBeCloseTo(plate / prop, 1);
  });
});

describe("WISPS_LOOK", () => {
  it("keeps even three overlapping wisps far under the bloom threshold", () => {
    const one =
      (relativeLuminance(WISPS_LOOK.color) ?? Number.NaN) *
      WISPS_LOOK.intensity;
    expect(one).toBeGreaterThan(0);
    expect(3 * one).toBeLessThan(BLOOM.threshold / 4);
  });
});

/** HSL hue in degrees and saturation 0 to 1 of a `#rrggbb` colour. */
function hueSat(hex: string): { hue: number; sat: number } {
  const [r, g, b] = [1, 3, 5].map(
    (i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255,
  ) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return { hue: 0, sat: 0 };
  const l = (max + min) / 2;
  const sat = d / (1 - Math.abs(2 * l - 1));
  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  return { hue: (hue * 60 + 360) % 360, sat };
}

describe("look feedback (task 17): darker, purple instead of amber", () => {
  it("has no yellow, amber or orange colour anywhere in the palette or the lights", () => {
    const colours = [
      ...Object.values(PALETTE),
      AMBIENT_LIGHTS.hemisphere.sky,
      AMBIENT_LIGHTS.moon.color,
      WISPS_LOOK.color,
      DETAILS_LOOK.signCore,
      ...DETAILS_LOOK.puddleGlow,
      ENVIRONMENT.roomColor,
    ];
    for (const hex of colours) {
      const { hue, sat } = hueSat(hex);
      // Saturated colours only; the near-greys and the poster paper don't count.
      if (sat > 0.3) {
        expect(hue < 15 || hue > 75, `${hex} at ${String(hue)}°`).toBe(true);
      }
    }
    expect(Object.keys(PALETTE)).not.toContain("amber");
  });

  it("uses deep purple for the secondary neon and red as the main one", () => {
    const purple = hueSat(PALETTE.purple);
    expect(purple.hue).toBeGreaterThan(260);
    expect(purple.hue).toBeLessThan(290);
    expect(relativeLuminance(PALETTE.purple)).toBeLessThan(0.2);
    expect(hueSat(PALETTE.violet).hue).toBeGreaterThan(250);
    expect(hueSat(PALETTE.violet).hue).toBeLessThan(290);
    const red = NEON_LIGHTS.filter((l) => l.color === "accent");
    expect(red.length).toBeGreaterThan(NEON_LIGHTS.length / 2 - 1);
    expect(NEON_LIGHTS.some((l) => l.color === "purple")).toBe(true);
    expect(DETAILS_LOOK.signColors.rooftop).toBe("accent");
  });

  it("is darker than the task 9 to 16 look", () => {
    // Task 36 lifted these a little (0.8, 0.8, 0.55 to 0.9, 1, 0.65); they stay well
    // below the task 9 to 16 values (1.1, 1.5, 1.1).
    expect(TONE_MAPPING.exposure).toBeLessThanOrEqual(0.9);
    expect(AMBIENT_LIGHTS.hemisphere.intensity).toBeLessThanOrEqual(1);
    expect(AMBIENT_LIGHTS.moon.intensity).toBeLessThanOrEqual(0.7);
    expect(BLOOM.strength).toBeLessThan(1.2);
    expect(ENVIRONMENT.intensity).toBeLessThan(0.6);
    const lightTotal = NEON_LIGHTS.reduce((sum, l) => sum + l.intensity, 0);
    expect(lightTotal).toBeLessThan(115);
    expect(SIGNS_LOOK.faceIntensity).toBeLessThan(1.3);
    expect(SIGNS_LOOK.litFaceIntensity).toBeLessThan(2.1);
    expect(DETAILS_LOOK.emissiveIntensity).toBeLessThan(1.4);
    expect(CABINET_LOOK.faceIntensity).toBeLessThan(1.3);
    expect(TERMINAL_LOOK.emissiveIntensity).toBeLessThan(1.6);
    expect(GRAFFITI_LOOK.emissiveIntensity).toBeLessThan(0.35);
    expect(WISPS_LOOK.intensity).toBeLessThan(0.18);
  });
});

describe("WINDOW_LOOK", () => {
  const glow = (hex: string): number =>
    (relativeLuminance(hex) ?? Number.NaN) * DETAILS_LOOK.emissiveIntensity;
  const colours = [
    ...Object.values(WINDOW_LOOK.lights).flatMap((l) => [l.glow, l.edge]),
    WINDOW_LOOK.dark,
    WINDOW_LOOK.sheen,
    WINDOW_LOOK.shadow,
    WINDOW_LOOK.crack,
  ];

  it("keeps every window colour dim, far under the bloom threshold", () => {
    for (const hex of colours)
      expect(glow(hex)).toBeLessThan(BLOOM.threshold / 4);
  });

  it("lights each kind of window brighter than dark glass", () => {
    for (const light of Object.values(WINDOW_LOOK.lights))
      expect(glow(light.glow)).toBeGreaterThan(4 * glow(WINDOW_LOOK.sheen));
  });

  it("has no yellow or amber light (purple, red and a cold blue-white only)", () => {
    for (const light of Object.values(WINDOW_LOOK.lights)) {
      const r = Number.parseInt(light.glow.slice(1, 3), 16);
      const g = Number.parseInt(light.glow.slice(3, 5), 16);
      const b = Number.parseInt(light.glow.slice(5, 7), 16);
      // Yellow and amber have green well over blue; these never do.
      expect(g).toBeLessThanOrEqual(b);
      expect(Math.max(r, g, b)).toBeGreaterThan(0);
    }
  });
});
