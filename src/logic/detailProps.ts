/** The plain detail props: AC units, vents, pipes, rooftop plant and puddles (task 39 split). */

import { STREET, type Side } from "./buildingLayout";
import { DETAIL_SIZES, roofTopY, standing, wallBox } from "./detailParts";
import type { DetailBox } from "./detailTypes";

const D = DETAIL_SIZES;

/** A wall-mounted AC unit: body, fan grille and two brackets underneath. */
export function acUnit(
  side: Side,
  alongM: number,
  bottomY: number,
): DetailBox[] {
  const body = { across: 0.9, up: 0.6, out: 0.45 };
  return [
    { kind: "metal", box: wallBox(side, alongM, bottomY, body, 0.02) },
    {
      kind: "plate",
      box: wallBox(
        side,
        alongM - 0.12,
        bottomY + 0.08,
        { across: 0.5, up: 0.44, out: 0.02 },
        0.02 + body.out,
      ),
    },
    ...[-0.3, 0.3].map((offset): DetailBox => ({
      kind: "metal",
      box: wallBox(
        side,
        alongM + offset,
        bottomY - 0.05,
        { across: 0.04, up: 0.05, out: 0.5 },
        0,
      ),
    })),
  ];
}

/** A louvred wall vent: a frame and three slats. */
export function vent(side: Side, alongM: number, bottomY: number): DetailBox[] {
  const frame = { across: 0.6, up: 0.4, out: 0.05 };
  return [
    { kind: "metal", box: wallBox(side, alongM, bottomY, frame) },
    ...[0.08, 0.18, 0.28].map((up): DetailBox => ({
      kind: "plate",
      box: wallBox(
        side,
        alongM,
        bottomY + up,
        { across: 0.52, up: 0.04, out: 0.04 },
        frame.out,
      ),
    })),
  ];
}

/** A vertical drain pipe from the pavement to the roof. */
export function drainPipe(side: Side, alongM: number): DetailBox {
  const top = roofTopY();
  return {
    kind: "metal",
    box: wallBox(
      side,
      alongM,
      0,
      { across: D.pipeM, up: top, out: D.pipeM },
      D.pipeGapM,
    ),
  };
}

/**
 * Puddles on the pavement (task 24; they lay on the street before, which now fades out):
 * centre and size on the ground, clear of the kerb stones, doors, spots and drains.
 */
export const PUDDLES: readonly {
  readonly x: number;
  readonly z: number;
  readonly sizeX: number;
  readonly sizeZ: number;
}[] = [
  { x: -6.4, z: 6.9, sizeX: 1.6, sizeZ: 0.8 },
  { x: 2.7, z: 7.1, sizeX: 1.3, sizeZ: 0.7 },
  { x: 7.9, z: 3, sizeX: 0.8, sizeZ: 1.6 },
  { x: 7.7, z: -3.6, sizeX: 0.9, sizeZ: 1.2 },
  { x: -7.6, z: -1.5, sizeX: 0.9, sizeZ: 1.8 },
  { x: 1.2, z: -7.6, sizeX: 1.8, sizeZ: 0.9 },
  { x: -2.4, z: -7.2, sizeX: 1.2, sizeZ: 0.6 },
  { x: 6.8, z: -7.4, sizeX: 1.1, sizeZ: 0.7 },
];

/** A horizontal pipe along a wall between two points along it, at height `y` (its centre). */
export function pipeRun(
  side: Side,
  fromM: number,
  toM: number,
  y: number,
): DetailBox {
  return {
    kind: "metal",
    box: wallBox(
      side,
      (fromM + toM) / 2,
      y - D.pipeM / 2,
      { across: Math.abs(toM - fromM), up: D.pipeM, out: D.pipeM },
      D.pipeGapM,
    ),
  };
}

/** A rooftop AC unit standing on the roof slab, with a fan plate on top. */
export function roofAc(x: number, z: number): DetailBox[] {
  const top = roofTopY();
  const size = { x: 1.6, y: 1, z: 1.1 };
  return [
    { kind: "metal", box: standing(x, z, top, size) },
    {
      kind: "plate",
      box: standing(x + 0.3, z, top + size.y, { x: 0.7, y: 0.03, z: 0.7 }),
    },
  ];
}

/** A vent stack on the roof with a cap. */
export function roofVent(x: number, z: number): DetailBox[] {
  const top = roofTopY();
  return [
    { kind: "metal", box: standing(x, z, top, { x: 0.25, y: 0.7, z: 0.25 }) },
    {
      kind: "plate",
      box: standing(x, z, top + 0.7, { x: 0.4, y: 0.06, z: 0.4 }),
    },
  ];
}

export function puddle(
  x: number,
  z: number,
  sizeX: number,
  sizeZ: number,
): DetailBox {
  return {
    kind: "puddle",
    box: standing(x, z, STREET.curbHeightM + 0.002, {
      x: sizeX,
      y: D.puddleM,
      z: sizeZ,
    }),
  };
}
