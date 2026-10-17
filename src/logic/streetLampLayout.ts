/**
 * Two street lamps (task 40): posts on the pavement in front of the front and back walls, at
 * diagonally opposite ends, each with an arm reaching towards the wall and a head about
 * level with the first floor. Their warm orange bulbs light the walls and pavement nearby, so the
 * building reads better; the neon signs still lead. Warm orange is allowed for these two
 * lamps only (user, 2026-10-18): signs and every other light stay red, purple or cyan.
 *
 * Steady: no flicker, the same under reduced motion. The posts and bulbs join the details
 * mesh (no draw call); the scene adds one point light under each head. Pure numbers in
 * metres.
 */

import { pavementY, type Box, type Rect, type Vec3 } from "./buildingLayout";
import type { DetailBox } from "./detailTypes";

export type StreetLamp = {
  readonly id: string;
  /** The post's centre on the ground. */
  readonly x: number;
  readonly z: number;
  /** Which way the arm reaches from the post, towards the building (a unit step on x or z). */
  readonly arm: { readonly x: number; readonly z: number };
};

export const STREET_LAMP = {
  /** The post: a square pole on a wider foot. */
  poleM: 0.12,
  foot: { sizeM: 0.3, upM: 0.4 },
  /** The arm's underside, the head's height: about level with the first floor (4.5 m up). */
  armY: 5.1,
  armM: 0.7,
  armThickM: 0.08,
  /** The head's housing at the arm's end, and the bulb hanging under it. */
  head: { across: 0.42, up: 0.12, deep: 0.3 },
  bulb: { across: 0.28, up: 0.14, deep: 0.2 },
  /** The point light sits this far under the bulb's centre. */
  lightDropM: 0.1,
} as const;

/**
 * The two lamps, diagonally opposite: one by the front kerb towards the front wall's left
 * end (left of the cabinet, as the visitor sees it), one on the alley's pavement towards
 * the back wall's left end (as seen from the alley). Each head hangs about 1.7 m out from
 * its wall and 0.4 m in from the corner, so it lights that wall and the end of the side wall
 * round the corner. Both clear every stop's view (tested).
 */
export const STREET_LAMPS: readonly StreetLamp[] = [
  { id: "lamp-front", x: -5.6, z: 7.45, arm: { x: 0, z: -1 } },
  { id: "lamp-back", x: 5.6, z: -7.4, arm: { x: 0, z: 1 } },
];

const S = STREET_LAMP;

const box = (centre: Vec3, size: Vec3): Box => ({ centre, size });

/** A size along the arm (`along`) and across it (`across`), on the ground axes. */
const sized = (
  lamp: StreetLamp,
  along: number,
  up: number,
  across: number,
): Vec3 =>
  lamp.arm.x === 0
    ? { x: across, y: up, z: along }
    : { x: along, y: up, z: across };

/** The head's centre on the ground: the arm's far end. */
function headXZ(lamp: StreetLamp): { x: number; z: number } {
  return {
    x: lamp.x + lamp.arm.x * S.armM,
    z: lamp.z + lamp.arm.z * S.armM,
  };
}

/** The bulb's centre. */
export function bulbCentre(lamp: StreetLamp): Vec3 {
  const h = headXZ(lamp);
  return { x: h.x, y: S.armY - S.bulb.up / 2, z: h.z };
}

/** Where a lamp's point light sits: just under its bulb. */
export function lampLightPosition(lamp: StreetLamp): Vec3 {
  const b = bulbCentre(lamp);
  return { ...b, y: b.y - S.lightDropM };
}

/** A lamp's plain metal parts (foot, pole, arm, head) and its glowing bulb. */
export function streetLampParts(lamp: StreetLamp): {
  boxes: DetailBox[];
  bulb: DetailBox;
} {
  const ground = pavementY();
  const poleTop = S.armY + S.armThickM;
  const h = headXZ(lamp);
  const metal = (b: Box): DetailBox => ({
    kind: "metal",
    noStickers: true,
    box: b,
  });
  return {
    boxes: [
      metal(
        box(
          { x: lamp.x, y: ground + S.foot.upM / 2, z: lamp.z },
          { x: S.foot.sizeM, y: S.foot.upM, z: S.foot.sizeM },
        ),
      ),
      metal(
        box(
          { x: lamp.x, y: (ground + poleTop) / 2, z: lamp.z },
          { x: S.poleM, y: poleTop - ground, z: S.poleM },
        ),
      ),
      metal(
        box(
          {
            x: (lamp.x + h.x) / 2,
            y: S.armY + S.armThickM / 2,
            z: (lamp.z + h.z) / 2,
          },
          sized(lamp, S.armM, S.armThickM, S.armThickM),
        ),
      ),
      metal(
        box(
          { x: h.x, y: S.armY + S.head.up / 2, z: h.z },
          sized(lamp, S.head.across, S.head.up, S.head.deep),
        ),
      ),
    ],
    bulb: {
      kind: "light",
      noStickers: true,
      glow: "street",
      box: box(
        bulbCentre(lamp),
        sized(lamp, S.bulb.across, S.bulb.up, S.bulb.deep),
      ),
    },
  };
}

/** Every lamp's parts: the metal first, then the bulbs. */
export function streetLampBoxes(
  lamps: readonly StreetLamp[] = STREET_LAMPS,
): DetailBox[] {
  const parts = lamps.map(streetLampParts);
  return [...parts.flatMap((p) => p.boxes), ...parts.map((p) => p.bulb)];
}

/** The lamps' feet on the ground, for litter to keep clear of. */
export function streetLampFootprints(marginM = 0): Rect[] {
  return STREET_LAMPS.map((l) => ({
    minX: l.x - S.foot.sizeM / 2 - marginM,
    maxX: l.x + S.foot.sizeM / 2 + marginM,
    minZ: l.z - S.foot.sizeM / 2 - marginM,
    maxZ: l.z + S.foot.sizeM / 2 + marginM,
  }));
}

/** The layout with the street lamps added after its own parts. */
export function withStreetLamps<
  L extends { readonly boxes: readonly DetailBox[] },
>(layout: L): L {
  return { ...layout, boxes: [...layout.boxes, ...streetLampBoxes()] };
}
