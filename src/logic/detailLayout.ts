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
  | "door";

export type DetailBox = { readonly kind: DetailKind; readonly box: Box };

/** A thin square bar between two points, for cables and braces that don't run along an axis. */
export type DetailBeam = {
  readonly kind: DetailKind;
  readonly from: Vec3;
  readonly to: Vec3;
  readonly thicknessM: number;
};

export type SignId = "rooftop" | "cafe" | "arcade";

/** A sign's glowing face, mapped to its own rectangle of the atlas. */
export type SignFace = { readonly sign: SignId; readonly quad: AtlasQuad };

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
  },
} as const satisfies {
  widthPx: number;
  heightPx: number;
  rects: Record<SignId | "dark" | "plateLit" | "puddle", PixelRect>;
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
  shopFace: { widthM: 3, heightM: 3 * (128 / 512) },
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
function vent(side: Side, alongM: number, bottomY: number): DetailBox[] {
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

/** A vertical drain pipe from the street to the roof. */
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
 * Utility poles standing in the low alley wall (task 19), carrying the cables that used to
 * end on the 5 m alley wall. `alongM` as for the back side.
 */
export const POLE = {
  alongM: [-3.2, 4.4],
  sizeM: 0.24,
  heightM: 9,
} as const;

function utilityPole(alongM: number): DetailBox {
  const out =
    STREET.alleyWidthM + STREET.alleyWallThicknessM / 2 - POLE.sizeM / 2;
  return {
    kind: "metal",
    box: wallBox(
      "back",
      alongM,
      0,
      { across: POLE.sizeM, up: POLE.heightM, out: POLE.sizeM },
      out,
    ),
  };
}

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
    box: standing(x, z, 0.002, { x: sizeX, y: D.puddleM, z: sizeZ }),
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
    0.02,
  );
  const out = 0.02 + D.plateDepthM + D.faceGapM;
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
  const alley = STREET.alleyWidthM;
  // Cables over the alley end on utility poles standing in the low wall across it.
  const poleTop = POLE.heightM - 0.3;
  const poleFace = alley + STREET.alleyWallThicknessM / 2 - POLE.sizeM / 2;
  const cafe = wallSign("cafe", "front", 2.6, 3.1, D.shopFace);
  const arcade = wallSign("arcade", "right", -2.2, 6.1, D.shopFace);
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
    ...vent("back", 2.5, 6.2),
    ...vent("front", -1.2, 7.4),
    ...vent("left", 2.5, 2.6),
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
    // Utility poles across the alley, carrying the cables from the back wall.
    ...POLE.alongM.map((alongM) => utilityPole(alongM)),
    // Puddles on the street round the corner and in the alley.
    puddle(-3, 10.5, 2.4, 1.1),
    puddle(3.5, 12.2, 1.4, 0.8),
    puddle(10.8, -1.5, 1, 2.4),
    puddle(10.5, 10, 1.6, 1.6),
    puddle(-11, 2.5, 0.9, 1.8),
    puddle(2, -7.2, 1.8, 0.9),
    puddle(-4.2, -6.2, 1, 0.7),
    // Signs.
    cafe.plate,
    arcade.plate,
    ...roof.boxes,
  ];

  const beams: DetailBeam[] = [
    // Sagging across the front's top floor.
    ...cable(
      pointOnSide("front", -halfW + 0.1, 11.9, 0.06),
      pointOnSide("front", halfW - 0.1, 11.9, 0.06),
      0.6,
    ),
    // From the back wall over the alley to the utility poles.
    ...cable(
      pointOnSide("back", -2, 10.5, 0.05),
      pointOnSide("back", -3.2, poleTop, poleFace),
      0.5,
    ),
    ...cable(
      pointOnSide("back", 3, 9.6, 0.05),
      pointOnSide("back", 4.4, poleTop - 0.4, poleFace),
      0.4,
    ),
    ...cable(
      pointOnSide("back", -5, 8, 0.05),
      pointOnSide("back", -3.2, poleTop - 0.6, poleFace),
      0.3,
    ),
    // From the right side's AC unit up to the roof, and between the left side's two.
    ...cable(
      pointOnSide("right", 2.5, 10.5, 0.3),
      pointOnSide("right", 3.2, top - 0.1, 0.05),
      0.1,
    ),
    ...cable(
      pointOnSide("left", -2.75, 10.5, 0.3),
      pointOnSide("left", 2.55, 9.7, 0.3),
      0.35,
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
 * every face; everything else samples the black patch.
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
        const uv = part.kind === "puddle" ? puddleCorners[corner] : dark;
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
        atlasUvs.push(...dark);
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
