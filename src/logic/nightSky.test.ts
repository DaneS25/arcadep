import { describe, expect, it } from "vitest";
import { BLOOM } from "./lookConfig";
import {
  AURORA,
  EDGE_WAVES,
  FOLD_WAVES,
  GAP_WAVES,
  SKY,
  advanceAuroraTime,
  auroraColor,
  auroraEdgeRad,
  hexToLinear,
  linearToSrgb,
  lumaOf,
  skyColor,
  skyDomeData,
  skyHaze,
  type Rgb,
} from "./nightSky";
import { PALETTE } from "./palette";

const DEG = Math.PI / 180;

/** Hue in degrees and HSV saturation of an sRGB colour. */
function hueSat(c: Rgb): { hue: number; sat: number } {
  const [r, g, b] = c;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0 || max === 0) return { hue: 0, sat: 0 };
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { hue: (h * 60 + 360) % 360, sat: d / max };
}

/** No yellow, amber or orange (nor yellow-green): hue outside 15° to 90° once it has colour. */
const notWarm = (c: Rgb): boolean => {
  const { hue, sat } = hueSat(linearToSrgb(c));
  return sat < 0.2 || hue < 15 || hue > 90;
};

/** Directions and times sampled over the whole sky and the aurora's period. */
function* samples(): Generator<[number, number, number]> {
  for (let e = -10; e <= 90; e += 2.5)
    for (let a = 0; a < 360; a += 7.5)
      for (let t = 0; t < AURORA.periodS; t += 37) yield [e * DEG, a * DEG, t];
}

const mix = (a: Rgb, b: Rgb, k: number): Rgb => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];

describe("the aurora's colours", () => {
  it("are the cold green and purple tokens", () => {
    expect(AURORA.low).toBe(PALETTE.aurora);
    expect(AURORA.high).toBe(PALETTE.purple);
    const low = hueSat(linearToSrgb(hexToLinear(AURORA.low)));
    expect(low.hue).toBeGreaterThan(130);
    expect(low.hue).toBeLessThan(175);
    const high = hueSat(linearToSrgb(hexToLinear(AURORA.high)));
    expect(AURORA.highGain).toBeGreaterThan(0);
    expect(high.hue).toBeGreaterThan(250);
    expect(high.hue).toBeLessThan(300);
  });

  it("never turn yellow, amber or orange anywhere in the sky, at any time", () => {
    for (const [e, a, t] of samples()) {
      const aurora = auroraColor(e, a, t);
      if (lumaOf(aurora) > 1e-4) expect(notWarm(aurora)).toBe(true);
      expect(notWarm(skyColor(e, a, t))).toBe(true);
    }
    // Every blend between the two ends is cold too (green through blue to purple).
    const lo = hexToLinear(AURORA.low);
    const hi = hexToLinear(AURORA.high);
    for (let k = 0; k <= 1; k += 0.05)
      expect(notWarm(mix(lo, hi, k))).toBe(true);
    expect(notWarm(hexToLinear(SKY.zenith))).toBe(true);
  });

  it("stay far under the bloom threshold, so the sky never glows", () => {
    let brightest = 0;
    for (const [e, a, t] of samples())
      brightest = Math.max(brightest, lumaOf(skyColor(e, a, t)));
    expect(brightest).toBeGreaterThan(0.05);
    expect(brightest).toBeLessThan(BLOOM.threshold / 3);
  });

  it("are green at the foot of the curtains and purple towards their tops", () => {
    const lo = auroraEdgeRad(0, 0);
    const foot = auroraColor(lo + AURORA.riseRad, 0, 0);
    const high = auroraColor(lo + AURORA.heightRad * 0.7, 0, 0);
    expect(foot[1]).toBeGreaterThan(foot[0]);
    expect(foot[1]).toBeGreaterThan(foot[2]);
    expect(high[2]).toBeGreaterThan(high[1]);
    // Nothing below the lower edge or above the top.
    expect(lumaOf(auroraColor(lo - DEG, 0, 0))).toBe(0);
    expect(lumaOf(auroraColor(lo + AURORA.heightRad + DEG, 0, 0))).toBe(0);
  });
});

describe("the aurora's motion", () => {
  it("holds still under reduced motion", () => {
    expect(AURORA.reducedMotionRate).toBe(0);
    let t = 123.4;
    for (let i = 0; i < 600; i += 1) t = advanceAuroraTime(t, 16, true);
    expect(t).toBe(123.4);
    // So every direction keeps exactly the same colour.
    expect(skyColor(25 * DEG, 1, t)).toEqual(skyColor(25 * DEG, 1, 123.4));
  });

  it("runs in real time otherwise, wrapping at the period", () => {
    expect(advanceAuroraTime(10, 500, false)).toBeCloseTo(10.5);
    expect(advanceAuroraTime(AURORA.periodS - 0.1, 200, false)).toBeCloseTo(
      0.1,
    );
    expect(advanceAuroraTime(10, -50, false)).toBe(10);
  });

  it("loops seamlessly at the period and joins up round the sky", () => {
    for (const w of [...EDGE_WAVES, ...FOLD_WAVES, ...GAP_WAVES]) {
      expect(Number.isInteger(w.cycles)).toBe(true);
      expect(Number.isInteger(w.turns)).toBe(true);
    }
    for (let a = 0; a < 360; a += 30) {
      const c = auroraColor(20 * DEG, a * DEG, 50);
      const later = auroraColor(20 * DEG, a * DEG, 50 + AURORA.periodS);
      for (const i of [0, 1, 2] as const) expect(later[i]).toBeCloseTo(c[i], 6);
    }
    expect(auroraEdgeRad(0, 30)).toBeCloseTo(auroraEdgeRad(2 * Math.PI, 30));
  });

  it("moves gently: the lower edge moves under 0.5° a second and the light changes slowly", () => {
    for (let a = 0; a < 360; a += 10)
      for (let t = 0; t < AURORA.periodS; t += 10) {
        const step = Math.abs(
          auroraEdgeRad(a * DEG, t + 1) - auroraEdgeRad(a * DEG, t),
        );
        expect(step).toBeLessThan(0.5 * DEG);
      }
    for (const [e, a, t] of samples()) {
      const now = lumaOf(auroraColor(e, a, t));
      const next = lumaOf(auroraColor(e, a, t + 1 / 60));
      // Under 1% of the peak a frame, so it never flickers.
      expect(Math.abs(next - now)).toBeLessThan(AURORA.intensity * 0.01);
    }
  });

  it("sits above the horizon haze, so it reads through the fog", () => {
    for (let a = 0; a < 360; a += 5)
      for (let t = 0; t < AURORA.periodS; t += 20)
        expect(auroraEdgeRad(a * DEG, t)).toBeGreaterThan(SKY.hazeRad);
  });
});

describe("the sky", () => {
  it("is the fog's colour at and below the horizon, so the faded ground meets it", () => {
    expect(SKY.horizon).toBe(PALETTE.base);
    const fog = hexToLinear(PALETTE.base);
    for (const e of [-30, -5, 0])
      for (const t of [0, 300]) {
        const c = skyColor(e * DEG, 1, t);
        for (const i of [0, 1, 2] as const) expect(c[i]).toBeCloseTo(fog[i], 9);
      }
    expect(skyHaze(0)).toBe(1);
    expect(skyHaze(SKY.hazeRad)).toBe(0);
    expect(skyHaze(SKY.hazeRad / 2)).toBeGreaterThan(0);
  });

  it("shades up to the zenith colour overhead, a little lighter than the horizon", () => {
    const zenith = skyColor(90 * DEG, 0, 0);
    const z = hexToLinear(SKY.zenith);
    for (const i of [0, 1, 2] as const) expect(zenith[i]).toBeCloseTo(z[i], 9);
    expect(lumaOf(zenith)).toBeGreaterThan(lumaOf(hexToLinear(SKY.horizon)));
  });
});

type V = readonly [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

describe("skyDomeData", () => {
  const data = skyDomeData();
  const triple = (list: readonly number[], i: number): V => [
    list[i * 3] ?? 0,
    list[i * 3 + 1] ?? 0,
    list[i * 3 + 2] ?? 0,
  ];

  it("puts every vertex on the sphere with its normal pointing in", () => {
    for (let i = 0; i < data.positions.length / 3; i += 1) {
      const p = triple(data.positions, i);
      expect(Math.hypot(...p)).toBeCloseTo(SKY.radiusM, 6);
      expect(dot(triple(data.normals, i), p)).toBeCloseTo(-SKY.radiusM, 6);
    }
    expect(data.uvs.length).toBe((data.positions.length / 3) * 2);
  });

  it("turns every triangle to face the centre, with no empty ones", () => {
    expect(data.indices.length % 3).toBe(0);
    for (let k = 0; k < data.indices.length; k += 3) {
      const a = triple(data.positions, data.indices[k] ?? 0);
      const b = triple(data.positions, data.indices[k + 1] ?? 0);
      const c = triple(data.positions, data.indices[k + 2] ?? 0);
      const n = cross(sub(b, a), sub(c, a));
      expect(Math.hypot(...n)).toBeGreaterThan(1e-6);
      const mid: V = [
        a[0] + b[0] + c[0],
        a[1] + b[1] + c[1],
        a[2] + b[2] + c[2],
      ];
      expect(dot(n, mid)).toBeLessThan(0);
    }
  });

  it("stays a small mesh (under 1,000 triangles)", () => {
    expect(data.indices.length / 3).toBeLessThan(1000);
  });
});
