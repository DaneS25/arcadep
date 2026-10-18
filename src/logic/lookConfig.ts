import type { TextureSlot } from "./assetManifest";
import { PALETTE, type PaletteToken } from "./palette";

/**
 * Look-pass settings (task 9): what each surface is made of, how bright the neon is,
 * bloom, fog, tone mapping and the coloured lights. Pure config, so the numbers are tested
 * and the scene modules only apply them.
 */

/** The merged surfaces of the street corner. */
export type SurfaceId = "wall" | "trim" | "sidewalk" | "ground";

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
  /** Only the colour map, no normal or roughness map: plain, and cheaper to shade. */
  readonly colorMapOnly?: boolean;
};

export const SURFACES: Readonly<Record<SurfaceId, SurfaceLook>> = {
  wall: {
    slot: "brick",
    fallback: "wall",
    tint: "#9a9aa6",
    tileM: 2,
    // Matt, weathered brick (task 41: was 0.9 and 0.4), so the walls don't shine.
    roughness: 0.96,
    metalness: 0,
    envMapIntensity: 0.2,
  },
  trim: {
    slot: "concrete",
    fallback: "trim",
    tint: "#8a8a96",
    tileM: 2,
    // Matt concrete trim (task 41: was 0.8 and 0.4).
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: 0.2,
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
  // Plain grey concrete running on past the kerb into the dark (task 38, was the wet
  // asphalt street): rough and matt, colour map only, no brighter than the trim, so it reads
  // as ground without pulling the eye.
  ground: {
    slot: "concrete",
    fallback: "ground",
    tint: "#8a8a90",
    tileM: 3,
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.25,
    colorMapOnly: true,
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
 * else the plain fallback colour with no maps at all. A `colorMapOnly` surface never takes
 * the normal or roughness map.
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
    normalMap: look.colorMapOnly === true ? null : maps.normal,
    roughnessMap: look.colorMapOnly === true ? null : maps.roughness,
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
 * Task 41 took it from 0.9 to 0.85, so the neon is no brighter after the exposure lift.
 */
export const NEON_BLOOM_LUMA = 0.85;

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
  // Task 41: was 1.1 and 1.8, dimmed with the exposure lift so the signs keep the same lead.
  faceIntensity: 1.04,
  /** Brighter faces while the cluster is hovered or focused. */
  litFaceIntensity: 1.7,
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
  /** The posters only (task 19), while the back wall is hovered or focused. */
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
    // Weathered, matt metal (task 41: was 0.6, 0.5 and 0.8): rougher and less metallic,
    // so the props catch less specular shine and less of the environment.
    roughness: 0.78,
    metalness: 0.3,
    envMapIntensity: 0.4,
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
    // Windows and doors (task 20): dark painted frames, grey weathered planks, doors
    // between the two.
    frame: 0.18,
    board: 0.4,
    door: 0.26,
    // The back door lamp's bulb (task 23): black under its glow, like the sign faces.
    lamp: 0,
    // The generator's slits (task 28): black under their cold glow.
    glow: 0,
    // The overhead wires (task 29): a pale grey, over the metal, so they catch the neon
    // and read as a tangle against the dark walls (with `WIRE_LOOK.sheen`).
    wire: 1.4,
    // The wire taps' LEDs (task 33): black under their glow, like the lamp.
    led: 0,
    // The small lights' bulbs and tubes (task 34): black under their glow.
    light: 0,
    // The street lamps' wrought iron (task 41): dark, nearly black.
    iron: 0.22,
  },
  emissiveIntensity: 1.2,
  /**
   * The rooftop, shop and exit signs' colours are drawn at this share (in linear light), so
   * the slight exposure lift of task 41 leaves them no brighter than before.
   */
  signDim: 0.94,
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

/**
 * Window glass (task 20), drawn into the details atlas and glowing through its emissive
 * map: dim purple, red or cold light, every colour far under the bloom threshold, so the
 * windows light the walls a little without blooming. `glow` is the brightest spot of a
 * pane, `edge` its corners; dark glass only shows a faint sheen.
 */
export const WINDOW_LOOK = {
  lights: {
    purple: { glow: "#4a2478", edge: "#1a0b2c" },
    red: { glow: "#5e1822", edge: "#22070c" },
    cold: { glow: "#5a6e80", edge: "#1a2128" },
  },
  /** Unlit glass and its sheen. */
  dark: "#050508",
  sheen: "#14141c",
  /** Blinds, mullions, silhouettes and the cracks' shadow: near black. */
  shadow: "#040306",
  /** Pale lines of cracked glass catching light. */
  crack: "#2c2c36",
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

/**
 * Steam from the vents (task 23), drawn like the wisps (additive, pale) but smaller and
 * thicker. Puffs near the back door lamp take on its cold violet light (`lampGain` at
 * the lamp, falling off with `lampGlow`). Kept under the bloom threshold.
 */
export const STEAM_LOOK = {
  color: "#a4a8c4",
  /** Brightest a puff gets away from the lamp (its colour times this, times its opacity). */
  intensity: 1,
  /** Added at the lamp, in the lamp's colour. */
  lampGain: 2.4,
} as const;

/**
 * The dim caged lamp over the back door (task 23): a cold, violet-white bulb, no yellow
 * or amber. Its point light reaches the door, the steam and the fire escape above it,
 * and stops short of the poster row's middle. Not a fill light: exposure and fill stay
 * as they are until task 25.
 */
export const LAMP_LOOK = {
  /** The light's colour. */
  color: "#b0a4ff",
  intensity: 10,
  distanceM: 7,
  decay: 2,
  /** The bulb's glow in the details atlas (times the details' emissive intensity). */
  bulb: "#d6d0ff",
} as const;

/**
 * The generator (task 28), drawn into the details atlas: a dim cold cyan in its slits and a
 * faded stencil (dim red hazard stripes, a pale warning triangle and bolt) on black. All of
 * it far under the bloom threshold, so it hums quietly under the skill signs' neon.
 */
export const GENERATOR_LOOK = {
  glow: "#2b8aa3",
  stencilRed: "#5c1520",
  stencilPale: "#5a5a66",
  stencilBase: "#08080b",
} as const;

/**
 * The overhead wires (task 29): a faint, even violet-grey sheen through the details atlas,
 * like neon caught along the strands. Far under the bloom threshold, so they never glow.
 */
export const WIRE_LOOK = {
  sheen: "#272030",
} as const;

/**
 * The wire taps' LEDs (task 33): palette colours through the details atlas. Tiny, so even
 * where one blooms a touch it reads as a status light and never outshines a sign.
 */
export const LED_LOOK = {
  red: PALETTE.accent,
  cyan: PALETTE.cyan,
  purple: PALETTE.purple,
} as const;

/**
 * The small flickering lights (task 34): a cold violet-white bulb, a cold blue-white tube
 * and the exit sign's red lettering, all dim (the neon fragment uses the LEDs' purple), so
 * they never bloom and the main signs lead. No yellow or amber.
 */
export const LIGHTS_LOOK = {
  bulb: "#6e68a0",
  tube: "#5a7c92",
  exit: "#c42433",
} as const;

/**
 * The two street lamps (task 40): warm orange incandescent light, the one exception to the
 * no-yellow/amber rule (user, 2026-10-18: these two lamps only). Each point light lights
 * its wall, the corner beside it and the pavement below, but stays under the strongest
 * neon light, so the red and purple still lead. The lantern glass, in the details atlas,
 * is a pale warm orange over the bloom threshold, for a soft glow. Steady, never
 * flickering. Task 41 gave them more glow: intensity 24 to 26, reach 10 to 12 m, the glass
 * `#ffcc99` to `#ffd6a6` (and bigger, as a lantern).
 */
export const STREET_LAMP_LOOK = {
  color: "#ff8a3c",
  intensity: 26,
  distanceM: 12,
  decay: 2,
  bulb: "#ffd6a6",
} as const;

export const TONE_MAPPING = {
  // A slight lift in task 41 (was 0.9); the neon is dimmed to match.
  exposure: 0.95,
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
 * No shadows; four lights keep the per-pixel cost small. Task 41 dimmed each by about 5%
 * (28, 16, 20, 18 before) to offset the exposure lift.
 */
export const NEON_LIGHTS: readonly PointLightSpec[] = [
  {
    name: "front-red",
    color: "accent",
    position: { x: 0, y: 3.2, z: 7 },
    intensity: 26.5,
    distanceM: 22,
  },
  {
    name: "left-cyan",
    color: "cyan",
    position: { x: -8, y: 3.4, z: 0 },
    intensity: 15,
    distanceM: 18,
  },
  {
    name: "right-red",
    color: "accent",
    position: { x: 8.5, y: 6, z: 0 },
    intensity: 19,
    distanceM: 20,
  },
  {
    name: "alley-purple",
    color: "purple",
    position: { x: 0, y: 4, z: -7 },
    intensity: 17,
    distanceM: 16,
  },
];

export const AMBIENT_LIGHTS = {
  // A dim purple-grey night sky, darker since the look feedback (task 17), lifted a little
  // in task 36 and again in task 41 (1.0 and 0.65 before).
  hemisphere: { sky: "#2a2040", ground: PALETTE.base, intensity: 1.1 },
  moon: {
    color: "#7a74b8",
    intensity: 0.7,
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
