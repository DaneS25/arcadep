/** Sizes and the shared building blocks of the detail props (task 39 split). */

import {
  BUILDING,
  pointOnSide,
  sideNormal,
  sideTangent,
  wallHeightM,
  type Box,
  type Side,
  type Vec3,
} from "./buildingLayout";
import type { DetailBeam } from "./detailTypes";

/** Sizes in metres. Sign faces keep their atlas rectangle's aspect, so text isn't stretched. */
export const DETAIL_SIZES = {
  pipeM: 0.12,
  /** Out from the wall, past the floor bands' 0.15 m overhang. */
  pipeGapM: 0.2,
  cableM: 0.03,
  /** Puddles are a few millimetres thick, so they never z-fight with the street. */
  puddleM: 0.008,
  rooftopFace: { widthM: 7.2, heightM: 7.2 * (224 / 1024) },
  /** The hanging shop signs' faces (task 21; were 3 m wide, flat on the wall). */
  hangingFace: { widthM: 3.6, heightM: 3.6 * (128 / 512) },
  plateMarginM: 0.1,
  plateDepthM: 0.12,
  /** Gap between a face and its plate. */
  faceGapM: 0.004,
  /** Bottom of the rooftop sign over the roof slab. */
  rooftopBottomM: 1.2,
} as const;

const D = DETAIL_SIZES;

/** The roof slab's top, which the parapets and the rooftop props stand on. */
export function roofTopY(): number {
  return wallHeightM() + BUILDING.roofThicknessM;
}

/**
 * A box against a side's wall: `alongM` to the right of the wall's centre, from `bottomY`
 * up, `gapM` out from the wall, sized across the wall, up and out.
 */
export function wallBox(
  side: Side,
  alongM: number,
  bottomY: number,
  size: { across: number; up: number; out: number },
  gapM = 0,
): Box {
  const t = sideTangent(side);
  const n = sideNormal(side);
  return {
    centre: pointOnSide(
      side,
      alongM,
      bottomY + size.up / 2,
      gapM + size.out / 2,
    ),
    size: {
      x: Math.abs(t.x) * size.across + Math.abs(n.x) * size.out,
      y: size.up,
      z: Math.abs(t.z) * size.across + Math.abs(n.z) * size.out,
    },
  };
}

/** A box standing on the ground or the roof, by its centre on the ground plane. */
export function standing(
  x: number,
  z: number,
  bottomY: number,
  size: { x: number; y: number; z: number },
): Box {
  return { centre: { x, y: bottomY + size.y / 2, z }, size };
}

/**
 * Points along a hanging cable from `from` to `to`, sagging `sagM` at the middle (a
 * parabola, close enough to a catenary at these spans).
 */
export function sagPoints(
  from: Vec3,
  to: Vec3,
  sagM: number,
  segments: number,
): Vec3[] {
  const n = Math.max(1, Math.trunc(segments));
  const points: Vec3[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    points.push({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t - 4 * sagM * t * (1 - t),
      z: from.z + (to.z - from.z) * t,
    });
  }
  return points;
}

export function cable(from: Vec3, to: Vec3, sagM: number): DetailBeam[] {
  const points = sagPoints(from, to, sagM, 8);
  return points.slice(1).map((point, i) => ({
    kind: "cable",
    from: points[i] ?? point,
    to: point,
    thicknessM: D.cableM,
  }));
}
