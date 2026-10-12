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

/** Neon tubes: colour times this, so they pass the bloom threshold. */
export const NEON_INTENSITY = 3;

/**
 * The arcade cabinet (task 10): a painted metal body, and the marquee and screen (one
 * canvas texture) pushed a little past 1 so their bright text, not the dark glass, blooms.
 */
export const CABINET_LOOK = {
  bodyRoughness: 0.55,
  bodyMetalness: 0.25,
  /** Red glow on the body while it's hovered or focused. */
  highlightEmissive: 0.3,
  faceIntensity: 1.3,
} as const;

/** `UnrealBloomPass` settings. Only the neon (well above 1) should cross the threshold. */
export const BLOOM = {
  strength: 1.2,
  /** Spread of the glow, 0 to 1. */
  radius: 0.5,
  threshold: 0.8,
} as const;

export const FOG = {
  color: PALETTE.base,
  /** `FogExp2` density per metre. */
  density: 0.016,
} as const;

export const TONE_MAPPING = {
  exposure: 1.1,
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
    intensity: 40,
    distanceM: 22,
  },
  {
    name: "left-cyan",
    color: "cyan",
    position: { x: -8, y: 3.4, z: 0 },
    intensity: 25,
    distanceM: 18,
  },
  {
    name: "right-red",
    color: "accent",
    position: { x: 8.5, y: 6, z: 0 },
    intensity: 30,
    distanceM: 20,
  },
  {
    name: "alley-amber",
    color: "amber",
    position: { x: 0, y: 4, z: -7 },
    intensity: 20,
    distanceM: 16,
  },
];

export const AMBIENT_LIGHTS = {
  hemisphere: { sky: "#3a3a55", ground: PALETTE.base, intensity: 1.5 },
  moon: {
    color: "#8890c0",
    intensity: 1.1,
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
  intensity: 0.6,
} as const;

export const ENVIRONMENT_PANELS: readonly EnvironmentPanel[] = [
  {
    color: "accent",
    intensity: 6,
    position: { x: 0, y: 6, z: 18 },
    size: { width: 16, height: 3 },
    rotationYRad: Math.PI,
  },
  {
    color: "cyan",
    intensity: 4,
    position: { x: -18, y: 5, z: 0 },
    size: { width: 10, height: 2 },
    rotationYRad: Math.PI / 2,
  },
  {
    color: "accent",
    intensity: 5,
    position: { x: 18, y: 8, z: -4 },
    size: { width: 12, height: 2 },
    rotationYRad: -Math.PI / 2,
  },
  {
    color: "amber",
    intensity: 3,
    position: { x: 0, y: 4, z: -18 },
    size: { width: 14, height: 2 },
    rotationYRad: 0,
  },
];
