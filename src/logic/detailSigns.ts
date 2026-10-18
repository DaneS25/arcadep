/** The shop signs and the rooftop name sign (task 39 split). */

import {
  BUILDING,
  pointOnSide,
  sideNormal,
  type Side,
  type Vec3,
} from "./buildingLayout";
import { DETAIL_TEXTURE, detailUv } from "./detailAtlas";
import { DETAIL_SIZES, roofTopY, standing, wallBox } from "./detailParts";
import type { DetailBeam, DetailBox, SignFace, SignId } from "./detailTypes";

const D = DETAIL_SIZES;

/** A sign on a wall: its plate and its face just in front of it. */
function wallSign(
  sign: SignId,
  side: Side,
  alongM: number,
  bottomY: number,
  face: { widthM: number; heightM: number },
  gapM = 0.02,
): { plate: DetailBox; face: SignFace } {
  const m = D.plateMarginM;
  const plate = wallBox(
    side,
    alongM,
    bottomY,
    {
      across: face.widthM + 2 * m,
      up: face.heightM + 2 * m,
      out: D.plateDepthM,
    },
    gapM,
  );
  const out = gapM + D.plateDepthM + D.faceGapM;
  const at = (sa: number, su: number): Vec3 =>
    pointOnSide(
      side,
      alongM + (sa * face.widthM) / 2,
      bottomY + m + face.heightM / 2 + (su * face.heightM) / 2,
      out,
    );
  return {
    plate: { kind: "plate", box: plate },
    face: {
      sign,
      quad: {
        corners: [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)],
        normal: sideNormal(side),
        ...detailUv(DETAIL_TEXTURE.rects[sign]),
      },
    },
  };
}

/**
 * The two shop signs (task 21): the arcade sign on the front and the cafe sign on the right (swapped in task 31; words from `src/content/signage.ts`), each hung on
 * the floor above the shop, partly over the lower half of two of that floor's windows. A
 * sign stands off the wall on two brackets, far enough out to clear the window frames and
 * sills behind it, and hangs from them on two rods.
 */
export type HangingSignId = "cafe" | "arcade";

export type HangingSign = {
  readonly side: Side;
  readonly alongM: number;
  /** Bottom of the plate. */
  readonly bottomY: number;
  /** The brackets stand on the wall between the two windows the sign covers. */
  readonly bracketAlongM: readonly number[];
};

export const HANGING_SIGNS: Readonly<Record<HangingSignId, HangingSign>> = {
  // Swapped in task 31 (user): ARCADE over the arcade cabinet on the front, COFFEE on the
  // right. Each sign keeps its own text and colours; the slots, brackets and sizes stay.
  cafe: {
    side: "right",
    alongM: 1.8,
    bottomY: 5.1,
    bracketAlongM: [1.55, 2.05],
  },
  arcade: {
    side: "front",
    alongM: 1.25,
    bottomY: 5.1,
    bracketAlongM: [0.85, 1.65],
  },
};

export const HANGING_SIGN_PARTS = {
  /** Gap between the wall and the plate's back, past the sills' 0.12 m. */
  gapM: 0.3,
  /** Brackets' top over the plate's top. */
  bracketRiseM: 0.5,
  bracketM: 0.06,
  rodM: 0.025,
} as const;

const HP = HANGING_SIGN_PARTS;

function plateTopY(sign: HangingSign): number {
  return sign.bottomY + D.hangingFace.heightM + 2 * D.plateMarginM;
}

/** A hanging sign's outline on its wall, brackets included (along and up, in metres). */
export function hangingSignRect(id: HangingSignId): {
  minAlong: number;
  maxAlong: number;
  minY: number;
  maxY: number;
} {
  const sign = HANGING_SIGNS[id];
  const half = D.hangingFace.widthM / 2 + D.plateMarginM;
  return {
    minAlong: sign.alongM - half,
    maxAlong: sign.alongM + half,
    minY: sign.bottomY,
    maxY: plateTopY(sign) + HP.bracketRiseM,
  };
}

export function hangingSign(id: HangingSignId): {
  boxes: DetailBox[];
  face: SignFace;
} {
  const H = { ...HANGING_SIGNS[id], ...HP };
  const face = D.hangingFace;
  const sign = wallSign(id, H.side, H.alongM, H.bottomY, face, H.gapM);
  const plateTop = plateTopY(H);
  const bracketTopY = plateTop + H.bracketRiseM;
  // Out to just past the plate's middle, where the rods hang.
  const reach = H.gapM + D.plateDepthM / 2 + H.rodM;
  const boxes: DetailBox[] = [sign.plate];
  for (const alongM of H.bracketAlongM) {
    boxes.push(
      // Arm out from the wall.
      {
        kind: "metal",
        box: wallBox(
          H.side,
          alongM,
          bracketTopY - H.bracketM,
          { across: H.bracketM, up: H.bracketM, out: reach + H.rodM },
          0,
        ),
      },
      // Wall plate the arm is bolted to.
      {
        kind: "metal",
        box: wallBox(
          H.side,
          alongM,
          bracketTopY - 0.35,
          { across: 0.14, up: 0.35, out: 0.03 },
          0,
        ),
      },
      // Rod down to the plate's top, centred over its depth.
      {
        kind: "metal",
        box: wallBox(
          H.side,
          alongM,
          plateTop,
          {
            across: H.rodM,
            up: bracketTopY - H.bracketM - plateTop,
            out: H.rodM,
          },
          H.gapM + D.plateDepthM / 2 - H.rodM / 2,
        ),
      },
    );
  }
  return { boxes, face: sign.face };
}

/**
 * The rooftop name sign: a plate on two legs with diagonal braces, standing towards the
 * front of the roof, with the name on both faces so it reads from the front and the alley.
 */
export function rooftopSign(): {
  boxes: DetailBox[];
  beams: DetailBeam[];
  faces: SignFace[];
} {
  const face = D.rooftopFace;
  const m = D.plateMarginM;
  const z = BUILDING.depthM / 2 - 2.6;
  const bottom = roofTopY() + D.rooftopBottomM;
  const plateHeight = face.heightM + 2 * m;
  const legX = face.widthM / 2 - 0.6;
  const boxes: DetailBox[] = [
    {
      kind: "plate",
      box: standing(0, z, bottom, {
        x: face.widthM + 2 * m,
        y: plateHeight,
        z: D.plateDepthM,
      }),
    },
    ...[-legX, legX].map((x): DetailBox => ({
      kind: "metal",
      // Thinner than the plate, so the two never share a face.
      box: standing(x, z, roofTopY(), {
        x: 0.12,
        y: D.rooftopBottomM + plateHeight / 2,
        z: 0.1,
      }),
    })),
  ];
  const beams: DetailBeam[] = [-legX, legX].map((x) => ({
    kind: "metal",
    from: { x, y: roofTopY(), z: z - 1.3 },
    to: { x, y: bottom + plateHeight / 3, z: z - 0.08 },
    thicknessM: 0.08,
  }));
  const y0 = bottom + m;
  const y1 = y0 + face.heightM;
  const w = face.widthM / 2;
  const front = z + D.plateDepthM / 2 + D.faceGapM;
  const back = z - D.plateDepthM / 2 - D.faceGapM;
  const uv = detailUv(DETAIL_TEXTURE.rects.rooftop);
  const faces: SignFace[] = [
    {
      sign: "rooftop",
      quad: {
        corners: [
          { x: -w, y: y0, z: front },
          { x: w, y: y0, z: front },
          { x: w, y: y1, z: front },
          { x: -w, y: y1, z: front },
        ],
        normal: { x: 0, y: 0, z: 1 },
        ...uv,
      },
    },
    // Seen from the alley, left is +x, so the name still reads left to right.
    {
      sign: "rooftop",
      quad: {
        corners: [
          { x: w, y: y0, z: back },
          { x: -w, y: y0, z: back },
          { x: -w, y: y1, z: back },
          { x: w, y: y1, z: back },
        ],
        normal: { x: 0, y: 0, z: -1 },
        ...uv,
      },
    },
  ];
  return { boxes, beams, faces };
}
