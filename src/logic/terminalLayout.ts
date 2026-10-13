/**
 * The door terminal on the right side (task 13): a metal housing at hand height with a
 * screen and a keypad, and the side door it guards. Pure numbers in metres, in the same
 * local frame as the cabinet (`across`, `up` from the spot's bottom, `out` from its back
 * face); `scene/sides/doorTerminal.ts` builds one mesh from them.
 */

import { boxesGeometryData, type GeometryData } from "./boxGeometry";
import {
  sideNormal,
  sideOffsetM,
  sideTangent,
  STREET,
  type Box,
  type InteractionSpot,
  type Side,
  type Vec3,
} from "./buildingLayout";
import {
  glowGeometryData,
  spotFor,
  toWorld,
  worldBox,
  type GlowQuad,
  type LocalBox,
} from "./cabinetLayout";

export const TERMINAL_SIDE: Side = "right";

/**
 * The canvas: the screen in the top 60% of the rows, the keypad below. `housingUv` is a
 * texel in the keypad band's plain margin, so the housing and the door take its colour.
 */
export const TERMINAL_TEXTURE = {
  widthPx: 256,
  heightPx: 320,
  screen: { vMin: 0.4, vMax: 1 },
  keypad: { vMin: 0, vMax: 0.4 },
  housingUv: { u: 0.5, v: 0.02 },
} as const;

/** The side door, centred under the cyan neon strip over it (`neonLayout`). */
export const SIDE_DOOR = {
  alongM: 0.9,
  widthM: 1.1,
  heightM: 2.3,
  depthM: 0.1,
} as const;

type FaceSpec = {
  readonly across: number;
  readonly up: number;
  readonly width: number;
  readonly height: number;
  readonly vMin: number;
  readonly vMax: number;
};

/** How far the faces stand proud of the housing's front, so they never z-fight it. */
const FACE_PROUD_M = 0.002;

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

// Widths over heights match each band's pixels (256 x 192 and 256 x 128), so text isn't stretched.
const SCREEN: FaceSpec = {
  across: 0,
  up: 0.47,
  width: 0.4,
  height: 0.3,
  ...TERMINAL_TEXTURE.screen,
};
const KEYPAD: FaceSpec = {
  across: 0,
  up: 0.17,
  width: 0.3,
  height: 0.15,
  ...TERMINAL_TEXTURE.keypad,
};

export type TerminalLayout = {
  readonly side: Side;
  readonly id: InteractionSpot["id"];
  readonly spot: InteractionSpot;
  /** Housing then door, as world boxes. */
  readonly parts: readonly [Box, Box];
  /** Screen then keypad. */
  readonly faces: readonly [GlowQuad, GlowQuad];
};

function face(spot: InteractionSpot, spec: FaceSpec): GlowQuad {
  const w = spec.width / 2;
  const h = spec.height / 2;
  const at = (sa: number, su: number) =>
    toWorld(
      spot,
      spec.across + sa * w,
      spec.up + su * h,
      spot.size.z + FACE_PROUD_M,
    );
  return {
    corners: [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)],
    normal: sideNormal(spot.side),
    vMin: spec.vMin,
    vMax: spec.vMax,
  };
}

/** The terminal filling the right side's spot, and the door beside it on the pavement. */
export function terminalLayout(side: Side = TERMINAL_SIDE): TerminalLayout {
  const spot = spotFor(side);
  const spotBottomY = spot.position.y - spot.size.y / 2;
  const housing: LocalBox = {
    across: 0,
    up: spot.size.y / 2,
    out: spot.size.z / 2,
    size: spot.size,
  };
  // `out` counts from the spot's back face, which stands `gapM` off the wall; the door
  // spans from the wall itself to `depthM` out.
  const gapM =
    dot(spot.position, sideNormal(side)) - sideOffsetM(side) - spot.size.z / 2;
  const door: LocalBox = {
    across: SIDE_DOOR.alongM - dot(spot.position, sideTangent(side)),
    up: STREET.curbHeightM - spotBottomY + SIDE_DOOR.heightM / 2,
    out: SIDE_DOOR.depthM / 2 - gapM,
    size: { x: SIDE_DOOR.widthM, y: SIDE_DOOR.heightM, z: SIDE_DOOR.depthM },
  };
  return {
    side,
    id: spot.id,
    spot,
    parts: [worldBox(spot, housing), worldBox(spot, door)],
    faces: [face(spot, SCREEN), face(spot, KEYPAD)],
  };
}

/**
 * One mesh's vertex data: the housing and door boxes (every UV on the plain housing
 * texel), then the screen and keypad quads on their bands of the canvas.
 */
export function terminalGeometryData(
  layout: TerminalLayout = terminalLayout(),
): GeometryData {
  const boxes = boxesGeometryData(layout.parts, 1);
  const { u, v } = TERMINAL_TEXTURE.housingUv;
  const uvs = boxes.uvs.map((_, i) => (i % 2 === 0 ? u : v));
  const faces = glowGeometryData(layout.faces);
  const offset = boxes.positions.length / 3;
  return {
    positions: [...boxes.positions, ...faces.positions],
    normals: [...boxes.normals, ...faces.normals],
    uvs: [...uvs, ...faces.uvs],
    indices: [...boxes.indices, ...faces.indices.map((i) => i + offset)],
  };
}
