import { describe, expect, it } from "vitest";
import { CAMERA } from "./cameraOrbit";
import {
  BLOOM,
  CABINET_LOOK,
  ENVIRONMENT_PANELS,
  FOG,
  GRAFFITI_LOOK,
  NEON_INTENSITY,
  NEON_LIGHTS,
  SURFACES,
  fogFactor,
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
  it("drives the neon well past the bloom threshold", () => {
    expect(NEON_INTENSITY).toBeGreaterThan(BLOOM.threshold * 2);
    expect(BLOOM.threshold).toBeGreaterThan(0.5);
    expect(BLOOM.threshold).toBeLessThan(1);
  });

  it("colours the lights and environment panels with neon tokens only", () => {
    const neon = new Set(["accent", "cyan", "amber"]);
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
