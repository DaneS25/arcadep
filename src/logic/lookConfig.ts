import type { TextureSlot } from "./assetManifest";
import { PALETTE, type PaletteToken } from "./palette";

/**
 * Look-pass settings (task 9): what each surface is made of, how bright the neon is,
 * bloom, fog, tone mapping and the coloured lights. Pure config, so the numbers are tested
 * and the scene modules only apply them.
 */

/** The merged surfaces of the street corner. */
export type SurfaceId = "wall" | "trim" | "sidewalk" | "street";

export type SurfaceLook = {
  /** ambientCG material used when its colour map is present. */
  readonly slot: TextureSlot;
  /** Plain colour without textures (the blockout colours). */
  readonly fallback: PaletteToken;
  /** Multiplies the colour map, so daylight photos sit in a night scene. */
  readonly tint: string;
  /** Real-world size of one texture repeat. */
  readonly tileM: number;
  readonly roughness: number;
  readonly metalness: number;
  /** How strongly the neon environment map shows in the surface. */
  readonly envMapIntensity: number;
};

export const SURFACES: Readonly<Record<SurfaceId, SurfaceLook>> = {
  wall: {
    slot: "brick",
    fallback: "wall",
    tint: "#9a9aa6",
    tileM: 2,
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.4,
  },
  trim: {
    slot: "concrete",
    fallback: "trim",
    tint: "#8a8a96",
    tileM: 2,
    roughness: 0.8,
    metalness: 0,
    envMapIntensity: 0.4,
  },
  sidewalk: {
    slot: "concrete",
    fallback: "sidewalk",
    tint: "#7a7a86",
    tileM: 1.5,
    roughness: 0.55,
    metalness: 0.1,
    envMapIntensity: 0.8,
  },
  // Wet asphalt: smooth and slightly metallic so it mirrors the neon environment and the
  // coloured lights, without a second render pass.
  street: {
    slot: "asphalt",
    fallback: "ground",
    tint: "#6a6a74",
    tileM: 4,
    roughness: 0.28,
    metalness: 0.45,
    envMapIntensity: 1.6,
  },
};

export type MaterialMaps<T> = {
  readonly color: T | null;
  readonly normal: T | null;
  readonly roughness: T | null;
};

export type SurfaceMaterialParams<T> = {
  readonly color: string;
  readonly map: T | null;
  readonly normalMap: T | null;
  readonly roughnessMap: T | null;
  readonly roughness: number;
  readonly metalness: number;
  readonly envMapIntensity: number;
};

/**
 * What a surface's material is set to: the tinted texture maps when the colour map loaded,
 * else the plain fallback colour with no maps at all.
 */
export function surfaceMaterialParams<T>(
  look: SurfaceLook,
  maps: MaterialMaps<T>,
): SurfaceMaterialParams<T> {
  const common = {
    roughness: look.roughness,
    metalness: look.metalness,
    envMapIntensity: look.envMapIntensity,
  };
  if (maps.color === null) {
    return {
      ...common,
      color: PALETTE[look.fallback],
      map: null,
      normalMap: null,
      roughnessMap: null,
    };
  }
  return {
    ...common,
    color: look.tint,
    map: maps.color,
    normalMap: maps.normal,
    roughnessMap: maps.roughness,
  };
}

/**
 * How bright a linear colour is to the bloom pass (`LuminosityHighPassShader` weights).
 * Undefined for anything that isn't `#rrggbb`.
 */
export function bloomLuma(hex: string): number | undefined {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return undefined;
  const channel = (offset: number): number => {
    const c = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.299 * channel(1) + 0.587 * channel(3) + 0.114 * channel(5);
}

/**
 * Neon tubes all reach this brightness as the bloom pass sees it: just past the
 * threshold, so every colour glows the same, dimly (task 17, darker look). Red was 3 times
 * its colour before (about 0.95); deep purple, being dark, needs a larger multiplier.
 */
export const NEON_BLOOM_LUMA = 0.9;

/** What a neon tube's colour is multiplied by, so it reaches `NEON_BLOOM_LUMA`. */
export function neonIntensity(hex: string): number {
  const luma = bloomLuma(hex);
  return luma === undefined || luma <= 0 ? 1 : NEON_BLOOM_LUMA / luma;
}

/**
 * The arcade cabinet (task 10): a painted metal body, and the marquee and screen (one
 * canvas texture) pushed a little past 1 so their bright text, not the dark glass, blooms.
 */
export const CABINET_LOOK = {
  bodyRoughness: 0.55,
  bodyMetalness: 0.25,
  /** Red glow on the body while it's hovered or focused. */
  highlightEmissive: 0.3,
  faceIntensity: 1.1,
} as const;

/** The neon skill signs on the left side (task 11). */
export const SIGNS_LOOK = {
  /** Sign faces: atlas colour times this; the tubes pass the bloom threshold, the plates don't. */
  faceIntensity: 1.1,
  /** Brighter faces while the cluster is hovered or focused. */
  litFaceIntensity: 1.8,
  /**
   * Red glow on the plates while hovered or focused. The plates are part of the details
   * mesh since task 15, which draws this through its atlas.
   */
  highlightEmissive: 0.25,
} as const;

/** The graffiti wall (back side): spray paint and paper, lit a little so it reads in the dark alley. */
export const GRAFFITI_LOOK = {
  roughness: 0.9,
  /** The atlas also glows at this strength, kept under the bloom threshold so paint never blooms. */
  emissiveIntensity: 0.28,
  /** Brighter while the wall is hovered or focused. */
  litEmissiveIntensity: 0.5,
  /** Fully clear texels are skipped, so the wall's bricks show between the tags. */
  alphaTest: 0.02,
} as const;

/**
 * The door terminal (right side): painted metal, with the screen and keypad drawn on its
 * canvas and also used as the emissive map, so the screen's bright text blooms and the
 * dark housing doesn't.
 */
export const TERMINAL_LOOK = {
  roughness: 0.5,
  metalness: 0.35,
  emissiveIntensity: 1.4,
  /** Brighter screen while the terminal is hovered or focused. */
  litEmissiveIntensity: 2,
} as const;

/**
 * The detail props (task 14): rusty painted metal (the `metal` slot) shaded per part, with
 * the sign faces lit through the emissive atlas. The signs' text is bright enough to bloom;
 * the puddles' dim reflection patch and every plain part stay under the bloom threshold.
 */
export const DETAILS_LOOK = {
  surface: {
    slot: "metal",
    fallback: "prop",
    tint: "#8a8a96",
    tileM: 1,
    roughness: 0.6,
    metalness: 0.5,
    envMapIntensity: 0.8,
  } satisfies SurfaceLook,
  /** Grey shade per kind of part, multiplying the metal. */
  shades: {
    metal: 1,
    plate: 0.35,
    cable: 0.08,
    // About the street's own colour, so a puddle is a smear of reflected neon, not a hole.
    puddle: 0.3,
    face: 0,
    // The skill-sign plates (task 15): the old plain plate colour (`signPlate`) over `prop`,
    // in linear light, so merging them into the details mesh keeps their look.
    signPlate: 0.09,
  },
  emissiveIntensity: 1.2,
  /**
   * A thin, pale, hot line down each letter of the signs, drawn over the coloured glow:
   * only it blooms, so the words stay readable.
   */
  signCore: "#ffe4e8",
  /** The neon colour each sign's glow is drawn in. */
  signColors: { rooftop: "accent", cafe: "cyan", arcade: "purple" },
  /** The puddles' faint reflection of the neon: dim red and cyan, far under the bloom. */
  puddleGlow: ["#2a080d", "#04191d"],
} as const;

/** `UnrealBloomPass` settings. Only the neon (well above 1) should cross the threshold. */
export const BLOOM = {
  strength: 0.9,
  /** Spread of the glow, 0 to 1. */
  radius: 0.45,
  threshold: 0.8,
} as const;

export const FOG = {
  color: PALETTE.base,
  /** `FogExp2` density per metre. */
  density: 0.016,
} as const;

/**
 * The drifting fog wisps (task 15): soft pale blobs added on top of the scene (additive),
 * so they lighten the dark like lit mist and never need sorting. Kept far under the bloom
 * threshold, even where a few overlap, so fog never glows.
 */
export const WISPS_LOOK = {
  /** A cool, pale grey: mist lit by the street and the neon. */
  color: "#9aa0b8",
  /** Brightest a wisp gets (its colour times this, times its own strength). */
  intensity: 0.14,
  /** Side of the generated wisp texture, in pixels. */
  texturePx: 128,
} as const;

export const TONE_MAPPING = {
  exposure: 0.8,
} as const;

/** How much of a surface `FogExp2` hides at `distanceM` (0 clear, 1 fully fogged). */
export function fogFactor(density: number, distanceM: number): number {
  const d = Math.max(0, density) * Math.max(0, distanceM);
  return 1 - Math.exp(-d * d);
}

export type PointLightSpec = {
  readonly name: string;
  readonly color: PaletteToken;
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly intensity: number;
  /** Range in metres; 0 means unlimited. */
  readonly distanceM: number;
};

/**
 * Coloured lights next to the neon, so the walls and the wet street pick up its glow.
 * No shadows; four lights keep the per-pixel cost small.
 */
export const NEON_LIGHTS: readonly PointLightSpec[] = [
  {
    name: "front-red",
    color: "accent",
    position: { x: 0, y: 3.2, z: 7 },
    intensity: 28,
    distanceM: 22,
  },
  {
    name: "left-cyan",
    color: "cyan",
    position: { x: -8, y: 3.4, z: 0 },
    intensity: 16,
    distanceM: 18,
  },
  {
    name: "right-red",
    color: "accent",
    position: { x: 8.5, y: 6, z: 0 },
    intensity: 20,
    distanceM: 20,
  },
  {
    name: "alley-purple",
    color: "purple",
    position: { x: 0, y: 4, z: -7 },
    intensity: 18,
    distanceM: 16,
  },
];

export const AMBIENT_LIGHTS = {
  // A dim purple-grey night sky, darker since the look feedback (task 17).
  hemisphere: { sky: "#2a2040", ground: PALETTE.base, intensity: 0.8 },
  moon: {
    color: "#7a74b8",
    intensity: 0.55,
    position: { x: -10, y: 20, z: 14 },
  },
} as const;

export type EnvironmentPanel = {
  readonly color: PaletteToken;
  /** Brightness multiplier of the glowing panel. */
  readonly intensity: number;
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly size: { readonly width: number; readonly height: number };
  /** Turn around +y so the panel faces the centre. */
  readonly rotationYRad: number;
};

/**
 * The tiny scene baked once into the environment map: a dark room with a few glowing
 * neon panels, so smooth surfaces (the wet street) reflect coloured light.
 */
export const ENVIRONMENT = {
  roomSizeM: 40,
  roomColor: "#0b0b12",
  /** Overall strength of the environment on every standard material. */
  intensity: 0.45,
} as const;

export const ENVIRONMENT_PANELS: readonly EnvironmentPanel[] = [
  {
    color: "accent",
    intensity: 5,
    position: { x: 0, y: 6, z: 18 },
    size: { width: 16, height: 3 },
    rotationYRad: Math.PI,
  },
  {
    color: "cyan",
    intensity: 3,
    position: { x: -18, y: 5, z: 0 },
    size: { width: 10, height: 2 },
    rotationYRad: Math.PI / 2,
  },
  {
    color: "accent",
    intensity: 4,
    position: { x: 18, y: 8, z: -4 },
    size: { width: 12, height: 2 },
    rotationYRad: -Math.PI / 2,
  },
  {
    color: "purple",
    intensity: 4,
    position: { x: 0, y: 4, z: -18 },
    size: { width: 14, height: 2 },
    rotationYRad: 0,
  },
];
