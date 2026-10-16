/**
 * The detail pass (task 14): AC units, pipes, cables, vents, puddles, the shop signs and
 * the rooftop name sign. Every piece merges into one mesh with one material (one draw
 * call): the metal texture through the first UV set, and one small atlas canvas through
 * the second, used as the emissive map, so only the sign faces glow. Each part's vertex
 * colour shades the metal (cables and puddles near black, sign faces black under their
 * glow). Pure numbers in metres; `scene/props/details.ts` builds the mesh and draws the
 * atlas.
 */

import { boxesGeometryData, type GeometryData } from "./boxGeometry";
import {
  BUILDING,
  STREET,
  pointOnSide,
  sideNormal,
  sideTangent,
  wallHeightM,
  type Box,
  type Side,
  type Vec3,
} from "./buildingLayout";
import type { AtlasQuad, PixelRect } from "./graffitiLayout";

/** What a part is made of, which sets its shade and how it samples the atlas. */
export type DetailKind =
  | "metal"
  | "plate"
  | "cable"
  | "puddle"
  | "face"
  /** The left side's skill-sign backing plates (task 15), merged in to save a draw call. */
  | "signPlate"
  /** Window and door frames and sills (task 20). */
  | "frame"
  /** Planks nailed over a window. */
  | "board"
  /** A door leaf. */
  | "door"
  /** A lamp's bulb (task 23): glows evenly with the atlas's lamp patch. */
  | "lamp"
  /** The generator's slits of cold light (task 28): glow evenly with the atlas's glow patch. */
  | "glow"
  /** The overhead wires (task 29): a shade lighter than the old cables, so they read at night. */
  | "wire"
  /** A wire tap's status LED (task 33): glows with its colour's atlas patch. */
  | "led"
  /** A small light's bulb or tube (task 34): glows with its colour's atlas patch. */
  | "light";

/**
 * What a glowing box (an LED or a small light) glows with: the palette's red, cyan or
 * purple (the taps' LEDs, task 33), or a small light's cold bulb or cold tube (task 34).
 */
export type GlowColor = "red" | "cyan" | "purple" | "bulb" | "tube";

export type DetailBox = {
  readonly kind: DetailKind;
  readonly box: Box;
  /** Keeps stickers off a box whose kind would get them (the generator, task 28 review). */
  readonly noStickers?: boolean;
  /** What an LED or a small light glows with (`led` and `light` kinds only). */
  readonly glow?: GlowColor;
  /** An LED or light that flickers (tasks 33 and 34): the scene swaps its atlas patch. */
  readonly blink?: true;
};

/** A thin square bar between two points, for cables and braces that don't run along an axis. */
export type DetailBeam = {
  readonly kind: DetailKind;
  readonly from: Vec3;
  readonly to: Vec3;
  readonly thicknessM: number;
};

export type SignId = "rooftop" | "cafe" | "arcade";

/** A quad of the atlas that isn't a sign: the generator's warning stencils (task 28), the back's exit sign (task 34). */
export type PatchFaceId = "stencil" | "exit";

/** A sign's glowing face (or a stencil), mapped to its own rectangle of the atlas. */
export type SignFace = {
  readonly sign: SignId | PatchFaceId;
  readonly quad: AtlasQuad;
};

/** A window's (or the shop door's) glass, mapped to its cell of the atlas (task 20). */
export type WindowGlass = {
  readonly cell: WindowCellId;
  /** Whether this pane's light now and then cuts out. */
  readonly flicker: boolean;
  readonly quad: AtlasQuad;
};

export type DetailLayout = {
  readonly boxes: readonly DetailBox[];
  readonly beams: readonly DetailBeam[];
  readonly faces: readonly SignFace[];
  /** Window glass, drawn after the faces (`withWindows`). */
  readonly glass: readonly WindowGlass[];
};

/**
 * The atlas: 1024 x 1024 px (inside the 1K budget). The rooftop sign across the top, the
 * two shop signs side by side below it, then a black patch that every plain part samples
 * (so it never glows), a faint red patch the skill-sign plates switch to while the cluster
 * is hovered, and a dim neon-reflection patch for the puddles. The bottom half holds the
 * window cells (`WINDOW_CELLS`, task 20).
 */
export const DETAIL_TEXTURE = {
  widthPx: 1024,
  heightPx: 1024,
  rects: {
    rooftop: { x: 0, y: 0, width: 1024, height: 224 },
    cafe: { x: 0, y: 224, width: 512, height: 128 },
    arcade: { x: 512, y: 224, width: 512, height: 128 },
    dark: { x: 0, y: 384, width: 128, height: 128 },
    plateLit: { x: 128, y: 384, width: 128, height: 128 },
    puddle: { x: 256, y: 384, width: 256, height: 128 },
    /** The back door lamp's bulb (task 23). */
    lamp: { x: 512, y: 384, width: 128, height: 128 },
    /** The generator's warning stencil and its slits' cold glow (task 28). */
    stencil: { x: 640, y: 384, width: 128, height: 128 },
    glow: { x: 768, y: 384, width: 128, height: 128 },
    /** The overhead wires' faint sheen (task 29), so they catch the neon in the dark. */
    wireSheen: { x: 896, y: 384, width: 128, height: 128 },
    /** The wire taps' LEDs (task 33), in a free corner beside the window cells. */
    ledRed: { x: 384, y: 704, width: 64, height: 64 },
    ledCyan: { x: 448, y: 704, width: 64, height: 64 },
    ledPurple: { x: 512, y: 704, width: 64, height: 64 },
    /** The small lights (task 34): a cold bulb, a cold tube, and the exit sign's face. */
    lightBulb: { x: 576, y: 704, width: 64, height: 64 },
    lightTube: { x: 640, y: 704, width: 64, height: 64 },
    exit: { x: 384, y: 768, width: 256, height: 96 },
  },
} as const satisfies {
  widthPx: number;
  heightPx: number;
  rects: Record<
    | SignId
    | PatchFaceId
    | "dark"
    | "plateLit"
    | "puddle"
    | "lamp"
    | "glow"
    | "wireSheen"
    | "ledRed"
    | "ledCyan"
    | "ledPurple"
    | "lightBulb"
    | "lightTube",
    PixelRect
  >;
};

/** A window cell of the atlas: one look of lit, shaded, dark or broken glass. */
export type WindowCellId =
  | "lit-purple"
  | "lit-red"
  | "lit-cold"
  | "blinds-purple"
  | "blinds-red"
  | "blinds-cold"
  | "silhouette-purple"
  | "silhouette-red"
  | "silhouette-cold"
  | "dark"
  | "broken";

const cell = (col: number, row: number): PixelRect => ({
  x: col * 128,
  y: 512 + row * 192,
  width: 128,
  height: 192,
});

/** The window cells, 128 x 192 px each (about a window's shape), under the signs. */
export const WINDOW_CELLS: Readonly<Record<WindowCellId, PixelRect>> = {
  "lit-purple": cell(0, 0),
  "lit-red": cell(1, 0),
  "lit-cold": cell(2, 0),
  "blinds-purple": cell(3, 0),
  "blinds-red": cell(4, 0),
  "blinds-cold": cell(5, 0),
  "silhouette-purple": cell(6, 0),
  "silhouette-red": cell(7, 0),
  "silhouette-cold": cell(0, 1),
  dark: cell(1, 1),
  broken: cell(2, 1),
};

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
function standing(
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

function cable(from: Vec3, to: Vec3, sagM: number): DetailBeam[] {
  const points = sagPoints(from, to, sagM, 8);
  return points.slice(1).map((point, i) => ({
    kind: "cable",
    from: points[i] ?? point,
    to: point,
    thicknessM: D.cableM,
  }));
}

/** A wall-mounted AC unit: body, fan grille and two brackets underneath. */
function acUnit(side: Side, alongM: number, bottomY: number): DetailBox[] {
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
function drainPipe(side: Side, alongM: number): DetailBox {
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
function pipeRun(side: Side, fromM: number, toM: number, y: number): DetailBox {
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
function roofAc(x: number, z: number): DetailBox[] {
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
function roofVent(x: number, z: number): DetailBox[] {
  const top = roofTopY();
  return [
    { kind: "metal", box: standing(x, z, top, { x: 0.25, y: 0.7, z: 0.25 }) },
    {
      kind: "plate",
      box: standing(x, z, top + 0.7, { x: 0.4, y: 0.06, z: 0.4 }),
    },
  ];
}

function puddle(x: number, z: number, sizeX: number, sizeZ: number): DetailBox {
  return {
    kind: "puddle",
    box: standing(x, z, STREET.curbHeightM + 0.002, {
      x: sizeX,
      y: D.puddleM,
      z: sizeZ,
    }),
  };
}

/** A pixel rectangle of the atlas as texture coordinates (v up, 0 at the bottom). */
export function detailUv(rect: PixelRect): {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
} {
  const t = DETAIL_TEXTURE;
  return {
    uMin: rect.x / t.widthPx,
    uMax: (rect.x + rect.width) / t.widthPx,
    vMin: 1 - (rect.y + rect.height) / t.heightPx,
    vMax: 1 - rect.y / t.heightPx,
  };
}

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
 * The two shop signs (task 21): ARCADE on the front and COFFEE on the right (swapped in task 31), each hung on
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

function hangingSign(id: HangingSignId): {
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
function rooftopSign(): {
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

/** Every detail prop round the building. */
export function detailLayout(): DetailLayout {
  const top = roofTopY();
  const halfW = BUILDING.widthM / 2;
  const cafe = hangingSign("cafe");
  const arcade = hangingSign("arcade");
  const roof = rooftopSign();

  const boxes: DetailBox[] = [
    // AC units on the upper floors, a couple on every side.
    ...acUnit("front", -4.2, 9.6),
    ...acUnit("front", 3.8, 10.4),
    ...acUnit("back", -1, 9.3),
    ...acUnit("back", 4, 10.6),
    ...acUnit("back", -3, 5.6),
    ...acUnit("right", 2.5, 9.9),
    ...acUnit("left", -3.2, 10.2),
    ...acUnit("left", 3, 9.4),
    // Rooftop plant.
    ...roofAc(-3.2, -2.2),
    ...roofAc(1.4, -2.8),
    ...roofVent(4.2, -3.5),
    ...roofVent(-4.6, 1),
    ...roofVent(3.2, 0.6),
    // Wall vents.
    ...vent("right", -3.5, 2.8),
    // Low on the first floor, under its right-hand window (task 27: the poster took its spot).
    ...vent("back", 0.9, 4.8),
    ...vent("front", -1.2, 7.4),
    // Between the two left-hand ground-floor windows (task 28: the generator took its spot).
    ...vent("left", -1.85, 2.6),
    // Drain pipes and a pipe run on the alley side.
    drainPipe("back", -halfW + 0.5),
    drainPipe("back", halfW - 0.5),
    drainPipe("right", -BUILDING.depthM / 2 + 0.4),
    drainPipe("left", -BUILDING.depthM / 2 + 0.4),
    pipeRun("back", -halfW + 0.5, -1, 11.4),
    {
      kind: "metal",
      box: wallBox(
        "back",
        -1,
        9.9,
        { across: D.pipeM, up: 11.4 - 9.9, out: D.pipeM },
        D.pipeGapM,
      ),
    },
    // Puddles on the pavement.
    ...PUDDLES.map((p) => puddle(p.x, p.z, p.sizeX, p.sizeZ)),
    // Signs.
    ...cafe.boxes,
    ...arcade.boxes,
    ...roof.boxes,
  ];

  const beams: DetailBeam[] = [
    // Sagging across the front's top floor.
    ...cable(
      pointOnSide("front", -halfW + 0.1, 11.9, 0.06),
      pointOnSide("front", halfW - 0.1, 11.9, 0.06),
      0.6,
    ),
    // From the right side's AC unit up to the roof. (The alley cables on the back wall and
    // the one between the left side's AC units went in task 29: from some orbits they crossed
    // the posters and the skill signs; the wires in `wireLayout` replace them.)
    ...cable(
      pointOnSide("right", 2.5, 10.5, 0.3),
      pointOnSide("right", 3.2, top - 0.1, 0.05),
      0.1,
    ),
    ...roof.beams,
  ];

  return {
    boxes,
    beams,
    faces: [cafe.face, arcade.face, ...roof.faces],
    glass: [],
  };
}

/** Vertex data for the merged details mesh: the usual geometry plus the atlas UVs and shades. */
export type DetailGeometryData = GeometryData & {
  /** Second UV set, into the atlas (the emissive map). */
  readonly atlasUvs: number[];
  /** RGB vertex colours: each part's grey shade. */
  readonly colors: number[];
};

/** Grey shade per kind, multiplying the metal colour or texture. */
export type DetailShades = Readonly<Record<DetailKind, number>>;

type Vec = Vec3;
const sub = (a: Vec, b: Vec): Vec => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const cross = (a: Vec, b: Vec): Vec => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const scale = (a: Vec, k: number): Vec => ({
  x: a.x * k,
  y: a.y * k,
  z: a.z * k,
});
const unit = (a: Vec): Vec => {
  const length = Math.hypot(a.x, a.y, a.z);
  return length > 0 ? scale(a, 1 / length) : { x: 0, y: 1, z: 0 };
};

/**
 * The layout with the skill signs' backing plates added at the end of its boxes (task 15):
 * they join the details mesh, so the signs cost one draw call (their faces) instead of two.
 */
export function withSignPlates(
  layout: DetailLayout,
  plates: readonly Box[],
): DetailLayout {
  return {
    ...layout,
    boxes: [
      ...layout.boxes,
      ...plates.map((box): DetailBox => ({ kind: "signPlate", box })),
    ],
  };
}

/** The atlas UV each glow colour samples (an LED's or a small light's lit patch). */
export function glowUvs(): Readonly<Record<GlowColor, [number, number]>> {
  const r = DETAIL_TEXTURE.rects;
  return {
    red: centreUv(r.ledRed),
    cyan: centreUv(r.ledCyan),
    purple: centreUv(r.ledPurple),
    bulb: centreUv(r.lightBulb),
    tube: centreUv(r.lightTube),
  };
}

/** Vertices per beam in `detailGeometryData` (4 sides of 4 corners), after the boxes. */
export const VERTICES_PER_BEAM = 16;

/** The first vertex of each face in `detailGeometryData`'s output (four each), after the boxes and beams. */
export function faceVertexStarts(layout: DetailLayout): number[] {
  const first =
    layout.boxes.length * VERTICES_PER_BOX +
    layout.beams.length * VERTICES_PER_BEAM;
  return layout.faces.map((_, i) => first + i * 4);
}

/** Vertices per box in `boxesGeometryData` (6 faces of 4 corners); boxes come first. */
export const VERTICES_PER_BOX = 24;

/**
 * The vertices of the sign plates in `detailGeometryData`'s output, so the scene can
 * switch their atlas UVs on hover. `withSignPlates` puts them last among the boxes.
 */
export function signPlateVertices(layout: DetailLayout): {
  readonly start: number;
  readonly count: number;
} {
  const first = layout.boxes.findIndex((part) => part.kind === "signPlate");
  if (first < 0) return { start: 0, count: 0 };
  const count = layout.boxes.length - first;
  return { start: first * VERTICES_PER_BOX, count: count * VERTICES_PER_BOX };
}

/**
 * The first vertex of each window pane in `detailGeometryData`'s output (four each), so the
 * scene can swap a flickering pane's atlas UVs. Panes come after boxes, beams and faces.
 */
export function glassVertexStarts(layout: DetailLayout): number[] {
  const first =
    layout.boxes.length * VERTICES_PER_BOX +
    layout.beams.length * 16 +
    layout.faces.length * 4;
  return layout.glass.map((_, i) => first + i * 4);
}

/** The atlas coordinates of a rectangle's corners: bottom-left, bottom-right, top-right, top-left. */
export function cornerUvs(rect: PixelRect): [number, number][] {
  const uv = detailUv(rect);
  return [
    [uv.uMin, uv.vMin],
    [uv.uMax, uv.vMin],
    [uv.uMax, uv.vMax],
    [uv.uMin, uv.vMax],
  ];
}

/** The atlas coordinates of a rectangle's centre. */
export function centreUv(rect: PixelRect): [number, number] {
  const uv = detailUv(rect);
  return [(uv.uMin + uv.uMax) / 2, (uv.vMin + uv.vMax) / 2];
}

/**
 * Merged vertex data for the whole layout. Boxes keep `boxesGeometryData`'s world UVs
 * (tiles of `tileM`); beams get four side faces each (their ends are too thin to see);
 * faces are quads mapped to their atlas rectangle. Puddles map the whole puddle patch on
 * every face, lamp bulbs the middle of the lamp patch, the generator's slits the middle of
 * the glow patch; everything else samples the black patch.
 */
export function detailGeometryData(
  layout: DetailLayout,
  tileM: number,
  shades: DetailShades,
): DetailGeometryData {
  const base = boxesGeometryData(
    layout.boxes.map((part) => part.box),
    tileM,
  );
  const positions = [...base.positions];
  const normals = [...base.normals];
  const uvs = [...base.uvs];
  const indices = [...base.indices];
  const atlasUvs: number[] = [];
  const colors: number[] = [];

  const dark = centreUv(DETAIL_TEXTURE.rects.dark);
  const lamp = centreUv(DETAIL_TEXTURE.rects.lamp);
  const glow = centreUv(DETAIL_TEXTURE.rects.glow);
  const wireSheen = centreUv(DETAIL_TEXTURE.rects.wireSheen);
  const glows = glowUvs();
  const puddle = detailUv(DETAIL_TEXTURE.rects.puddle);
  const puddleCorners: [number, number][] = [
    [puddle.uMin, puddle.vMin],
    [puddle.uMax, puddle.vMin],
    [puddle.uMax, puddle.vMax],
    [puddle.uMin, puddle.vMax],
  ];
  const shade = (kind: DetailKind): void => {
    const s = shades[kind];
    colors.push(s, s, s);
  };

  // 6 faces of 4 corners per box, in boxesGeometryData's order.
  for (const part of layout.boxes)
    for (let face = 0; face < 6; face += 1)
      for (let corner = 0; corner < 4; corner += 1) {
        const uv =
          part.kind === "puddle"
            ? puddleCorners[corner]
            : part.kind === "lamp"
              ? lamp
              : part.kind === "glow"
                ? glow
                : part.kind === "led" || part.kind === "light"
                  ? glows[part.glow ?? "red"]
                  : dark;
        atlasUvs.push(...(uv ?? dark));
        shade(part.kind);
      }

  for (const beam of layout.beams) {
    const d = unit(sub(beam.to, beam.from));
    const helper =
      Math.abs(d.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const a = unit(cross(d, helper));
    const b = cross(d, a);
    const h = beam.thicknessM / 2;
    const length = Math.hypot(
      beam.to.x - beam.from.x,
      beam.to.y - beam.from.y,
      beam.to.z - beam.from.z,
    );
    for (const n of [a, b, scale(a, -1), scale(b, -1)]) {
      // Right as seen looking at the face, so `r × d = n` and the winding faces out.
      const r = cross(d, n);
      const first = positions.length / 3;
      for (const [sr, end] of [
        [-1, 0],
        [1, 0],
        [1, 1],
        [-1, 1],
      ] as const) {
        const p = end === 0 ? beam.from : beam.to;
        positions.push(
          p.x + n.x * h + r.x * sr * h,
          p.y + n.y * h + r.y * sr * h,
          p.z + n.z * h + r.z * sr * h,
        );
        normals.push(n.x, n.y, n.z);
        uvs.push((sr * h) / tileM, (end * length) / tileM);
        atlasUvs.push(...(beam.kind === "wire" ? wireSheen : dark));
        shade(beam.kind);
      }
      indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
  }

  for (const { quad } of layout.faces) {
    const first = positions.length / 3;
    const corners: [number, number][] = [
      [quad.uMin, quad.vMin],
      [quad.uMax, quad.vMin],
      [quad.uMax, quad.vMax],
      [quad.uMin, quad.vMax],
    ];
    quad.corners.forEach((c, i) => {
      positions.push(c.x, c.y, c.z);
      normals.push(quad.normal.x, quad.normal.y, quad.normal.z);
      uvs.push(0, 0);
      atlasUvs.push(...(corners[i] ?? dark));
      shade("face");
    });
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }

  // Window panes: black under their glow, like the sign faces.
  for (const pane of layout.glass) {
    const first = positions.length / 3;
    const corners = cornerUvs(WINDOW_CELLS[pane.cell]);
    pane.quad.corners.forEach((c, i) => {
      positions.push(c.x, c.y, c.z);
      normals.push(pane.quad.normal.x, pane.quad.normal.y, pane.quad.normal.z);
      uvs.push(0, 0);
      atlasUvs.push(...(corners[i] ?? dark));
      shade("face");
    });
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }

  return { positions, normals, uvs, indices, atlasUvs, colors };
}
