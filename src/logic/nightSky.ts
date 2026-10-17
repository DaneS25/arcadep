/**
 * The night sky (task 38): a dome round the whole scene, dark navy overhead and the fog's
 * colour at the horizon, with a slow aurora: a ring of curtains whose lower edge waves
 * gently, cold green at the bottom turning purple higher up. Pure numbers, mirrored in the
 * dome's shader (`scene/ground.ts`), so the colours and the motion are tested here.
 *
 * - Every wave is a whole number of cycles in `AURORA.periodS` and round the sky, so the
 *   shader's clock can wrap at the period without a jump, and the curtains join up at the
 *   back of the sky.
 * - The clock stands still under reduced motion (`advanceAuroraTime`), so the aurora is a
 *   still picture then.
 * - The haze (`skyHaze`) mixes the fog's colour back in near the horizon, so the far ground,
 *   fading into the fog, meets the sky without a seam, and the aurora reads above it.
 * - It stays far under the bloom threshold, so the sky never glows and the signs lead.
 */

import type { GeometryData } from "./boxGeometry";
import { PALETTE } from "./palette";

const DEG = Math.PI / 180;

export const SKY = {
  /** The dome's radius: well inside the camera's 200 m far plane from any orbit (45 m out). */
  radiusM: 140,
  /** Segments round and from pole to pole: the colour is worked out per pixel, so few. */
  widthSegments: 32,
  heightSegments: 16,
  /** Overhead colour; it blends down to the fog colour at the horizon. */
  zenith: PALETTE.sky,
  horizon: PALETTE.base,
  /** The zenith colour is reached this high up. */
  gradientRad: 50 * DEG,
  /** The fog's colour is mixed into the sky up to this height (all of it at the horizon). */
  hazeRad: 9 * DEG,
} as const;

export const AURORA = {
  /** Cold green low in the curtains, purple at their tops. No yellow or amber. */
  low: PALETTE.aurora,
  high: PALETTE.purple,
  /** Peak brightness (linear) the colours are scaled by. */
  intensity: 0.2,
  /** The purple is darker than the green, so it is lifted this much to read at the tops. */
  highGain: 2,
  /** The curtains' lower edge sits this high, on average, waving up and down by `waveRad`. */
  baseRad: 14 * DEG,
  waveRad: 3 * DEG,
  /** Sharp lower edge, then fading out over `heightRad` above it. */
  riseRad: 1.5 * DEG,
  heightRad: 15 * DEG,
  /** The darkest folds (between the rays) keep this share of the brightness. */
  foldFloor: 0.15,
  /** Where the broad patches (`GAP_WAVES`) fade the aurora out: none below, all above. */
  gapFrom: -0.4,
  gapTo: 0.6,
  /** Every wave repeats in this many seconds (the shader's clock wraps here). */
  periodS: 600,
  /** Under reduced motion the aurora's clock moves at this share of real time (still). */
  reducedMotionRate: 0,
} as const;

/** One wave: `cycles` round the sky, `turns` per period, a phase, a weight. */
type Wave = {
  readonly cycles: number;
  readonly turns: number;
  readonly phase: number;
  readonly weight: number;
};

/** The lower edge's waving (weights add to 1). */
export const EDGE_WAVES: readonly Wave[] = [
  { cycles: 2, turns: 3, phase: 0, weight: 0.6 },
  { cycles: 5, turns: -4, phase: 1.3, weight: 0.4 },
];

/** The folds' brightness along the curtains, squared into narrow rays (weights add to 1). */
export const FOLD_WAVES: readonly Wave[] = [
  { cycles: 31, turns: 7, phase: 0, weight: 0.6 },
  { cycles: 53, turns: -9, phase: 2.1, weight: 0.4 },
];

/** Broad patches round the sky, so the aurora comes and goes instead of ringing the scene. */
export const GAP_WAVES: readonly Wave[] = [
  { cycles: 1, turns: 1, phase: 0.4, weight: 0.65 },
  { cycles: 3, turns: -2, phase: 2.6, weight: 0.35 },
];

/** Linear RGB, each channel 0 to 1 (or more before tone mapping). */
export type Rgb = readonly [number, number, number];

const smoothstep = (a: number, b: number, t: number): number => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** A `#rrggbb` colour in linear RGB, as three.js turns it into for uniforms. */
export function hexToLinear(hex: string): Rgb {
  const channel = (offset: number): number => {
    const c = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel(1), channel(3), channel(5)];
}

/** A linear colour back in sRGB (0 to 1 per channel, clamped). */
export function linearToSrgb(c: Rgb): Rgb {
  const f = (x: number): number => {
    const v = Math.min(1, Math.max(0, x));
    return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  };
  return [f(c[0]), f(c[1]), f(c[2])];
}

/** The bloom pass's brightness of a linear colour (`LuminosityHighPassShader` weights). */
export function lumaOf(c: Rgb): number {
  return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
}

/**
 * The aurora's clock moved on by a frame, wrapped into one period: real time normally,
 * none under reduced motion, so the aurora holds still.
 */
export function advanceAuroraTime(
  timeS: number,
  dtMs: number,
  reducedMotion: boolean,
): number {
  const rate = reducedMotion ? AURORA.reducedMotionRate : 1;
  const next = timeS + (Math.max(0, dtMs) / 1000) * rate;
  return next % AURORA.periodS;
}

const wavesAt = (
  waves: readonly Wave[],
  azimuthRad: number,
  timeS: number,
): number => {
  const w = (2 * Math.PI) / AURORA.periodS;
  let sum = 0;
  for (const wave of waves)
    sum +=
      wave.weight *
      Math.sin(wave.cycles * azimuthRad + wave.turns * w * timeS + wave.phase);
  return sum;
};

/** Height of the curtains' lower edge above the horizon at an azimuth and time. */
export function auroraEdgeRad(azimuthRad: number, timeS: number): number {
  return (
    AURORA.baseRad + AURORA.waveRad * wavesAt(EDGE_WAVES, azimuthRad, timeS)
  );
}

/**
 * The aurora's light (linear RGB, added to the sky) in one direction: `elevationRad` above
 * the horizon, `azimuthRad` round it, at `timeS` on its clock.
 */
export function auroraColor(
  elevationRad: number,
  azimuthRad: number,
  timeS: number,
): Rgb {
  const lo = auroraEdgeRad(azimuthRad, timeS);
  const top = lo + AURORA.heightRad;
  const curtain =
    smoothstep(lo, lo + AURORA.riseRad, elevationRad) *
    (1 - smoothstep(lo + AURORA.riseRad, top, elevationRad));
  const fold = (0.5 + 0.5 * wavesAt(FOLD_WAVES, azimuthRad, timeS)) ** 2;
  const patch = smoothstep(
    AURORA.gapFrom,
    AURORA.gapTo,
    wavesAt(GAP_WAVES, azimuthRad, timeS),
  );
  const strength =
    AURORA.intensity *
    curtain *
    patch *
    (AURORA.foldFloor + (1 - AURORA.foldFloor) * fold);
  const k = smoothstep(lo + AURORA.riseRad, top, elevationRad);
  const a = hexToLinear(AURORA.low);
  const high = hexToLinear(AURORA.high);
  const b: Rgb = [
    high[0] * AURORA.highGain,
    high[1] * AURORA.highGain,
    high[2] * AURORA.highGain,
  ];
  return [
    (a[0] + (b[0] - a[0]) * k) * strength,
    (a[1] + (b[1] - a[1]) * k) * strength,
    (a[2] + (b[2] - a[2]) * k) * strength,
  ];
}

/** How much of the fog's colour is mixed into the sky: all of it at and below the horizon. */
export function skyHaze(elevationRad: number): number {
  return 1 - smoothstep(0, SKY.hazeRad, elevationRad);
}

/** The finished sky colour (linear RGB) in one direction, as the dome's shader draws it. */
export function skyColor(
  elevationRad: number,
  azimuthRad: number,
  timeS: number,
): Rgb {
  const h = hexToLinear(SKY.horizon);
  const z = hexToLinear(SKY.zenith);
  const g = smoothstep(0, SKY.gradientRad, elevationRad);
  const aurora = auroraColor(elevationRad, azimuthRad, timeS);
  const haze = skyHaze(elevationRad);
  const channel = (i: 0 | 1 | 2): number => {
    const lit = h[i] + (z[i] - h[i]) * g + aurora[i];
    return lit + (h[i] - lit) * haze;
  };
  return [channel(0), channel(1), channel(2)];
}

/**
 * The sky dome: a whole sphere of `SKY.radiusM` round the origin, its faces turned inwards
 * (counter-clockwise seen from inside) so the camera sees them. The normals point in too;
 * UVs are unused (0). Azimuth runs from +x towards +z, as `Math.atan2(z, x)`.
 */
export function skyDomeData(
  radiusM: number = SKY.radiusM,
  widthSegments: number = SKY.widthSegments,
  heightSegments: number = SKY.heightSegments,
): GeometryData {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= heightSegments; j += 1) {
    // From the top pole (j = 0) down to the bottom pole.
    const polar = (j / heightSegments) * Math.PI;
    for (let i = 0; i <= widthSegments; i += 1) {
      const azimuth = (i / widthSegments) * 2 * Math.PI;
      const x = Math.sin(polar) * Math.cos(azimuth);
      const y = Math.cos(polar);
      const z = Math.sin(polar) * Math.sin(azimuth);
      positions.push(x * radiusM, y * radiusM, z * radiusM);
      normals.push(-x, -y, -z);
      uvs.push(0, 0);
    }
  }
  const row = widthSegments + 1;
  for (let j = 0; j < heightSegments; j += 1)
    for (let i = 0; i < widthSegments; i += 1) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      // Skip the empty triangles at the poles.
      if (j > 0) indices.push(a, c, b);
      if (j < heightSegments - 1) indices.push(b, c, d);
    }
  return { positions, normals, uvs, indices };
}
