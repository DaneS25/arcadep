/**
 * The arcade cabinet on the front side (task 10): its parts as boxes, the two glowing faces
 * (marquee and screen) that share one canvas texture, and where the camera stops to look
 * at its screen. Pure numbers in metres; `scene/sides/cabinet.ts` builds the meshes.
 *
 * The cabinet fills the front side's interaction spot (task 5). Local coordinates: `across`
 * runs to the right of a visitor facing the cabinet, `up` from the spot's bottom and `out`
 * from the spot's back face (the side nearest the wall) towards the street.
 */

import {
  interactionSpots,
  sideAzimuthRad,
  sideNormal,
  sideTangent,
  type Box,
  type InteractionSpot,
  type Side,
  type Vec3,
} from "./buildingLayout";
import type { CameraPose } from "./cameraOrbit";
import type { GeometryData } from "./boxGeometry";

export const CABINET_SIDE: Side = "front";

type LocalBox = {
  readonly across: number;
  readonly up: number;
  readonly out: number;
  /** Full size: `x` across, `y` up, `z` out. */
  readonly size: Vec3;
};

/** The cabinet's solid parts, centre and size in local coordinates. */
const PARTS: readonly LocalBox[] = [
  // Lower body with the coin door.
  { across: 0, up: 0.475, out: 0.35, size: { x: 0.8, y: 0.95, z: 0.7 } },
  // Control panel sticking out towards the player.
  { across: 0, up: 1.0, out: 0.4, size: { x: 0.8, y: 0.1, z: 0.8 } },
  // Screen housing.
  { across: 0, up: 1.3, out: 0.225, size: { x: 0.8, y: 0.5, z: 0.45 } },
  // Marquee box on top, leaning out over the screen.
  { across: 0, up: 1.675, out: 0.3, size: { x: 0.8, y: 0.25, z: 0.6 } },
];

/**
 * The shared canvas texture is split in two: the marquee strip across the top quarter and
 * the attract screen below it. `vMin`/`vMax` are texture rows, 0 at the bottom.
 */
export const CABINET_TEXTURE = {
  widthPx: 512,
  heightPx: 512,
  marquee: { vMin: 0.75, vMax: 1 },
  screen: { vMin: 0, vMax: 0.75 },
} as const;

type LocalQuad = {
  readonly across: number;
  readonly up: number;
  /** Distance out from the spot's back face; just proud of the part it sits on. */
  readonly out: number;
  readonly width: number;
  readonly height: number;
  readonly vMin: number;
  readonly vMax: number;
};

/** Gap between a glowing face and the box behind it, so they never z-fight. */
const FACE_GAP_M = 0.004;

/** Screen: 4:3 like the texture region (512 x 384 px), set in the housing's front face. */
const SCREEN: LocalQuad = {
  across: 0,
  up: 1.3,
  out: 0.45 + FACE_GAP_M,
  width: 0.6,
  height: 0.45,
  ...CABINET_TEXTURE.screen,
};

/** Marquee: 4:1 like its texture strip (512 x 128 px), on the marquee box's front. */
const MARQUEE: LocalQuad = {
  across: 0,
  up: 1.675,
  out: 0.6 + FACE_GAP_M,
  width: 0.76,
  height: 0.19,
  ...CABINET_TEXTURE.marquee,
};

/** How the camera frames the screen: slightly above it, looking a little down. */
export const SCREEN_VIEW = {
  polarRad: (80 * Math.PI) / 180,
  /** Close enough that the screen fills a good part of a 50° view. */
  distanceM: 0.9,
} as const;

export type GlowQuad = {
  /** Corners: bottom-left, bottom-right, top-right, top-left, seen from the front. */
  readonly corners: readonly [Vec3, Vec3, Vec3, Vec3];
  readonly normal: Vec3;
  readonly vMin: number;
  readonly vMax: number;
};

export type CabinetLayout = {
  readonly side: Side;
  readonly id: InteractionSpot["id"];
  /** The spot the cabinet fills. */
  readonly spot: InteractionSpot;
  /** Solid parts as world boxes. */
  readonly parts: readonly Box[];
  /** Marquee then screen. */
  readonly faces: readonly [GlowQuad, GlowQuad];
  /** Centre of the screen. */
  readonly screenCentre: Vec3;
};

function spotFor(side: Side): InteractionSpot {
  const spot = interactionSpots().find((s) => s.side === side);
  if (spot === undefined) throw new Error(`no interaction spot for ${side}`);
  return spot;
}

/** A local point in world coordinates. */
function toWorld(
  spot: InteractionSpot,
  across: number,
  up: number,
  out: number,
): Vec3 {
  const t = sideTangent(spot.side);
  const n = sideNormal(spot.side);
  const dy = up - spot.size.y / 2;
  const dOut = out - spot.size.z / 2;
  return {
    x: spot.position.x + t.x * across + n.x * dOut,
    y: spot.position.y + dy,
    z: spot.position.z + t.z * across + n.z * dOut,
  };
}

function worldBox(spot: InteractionSpot, part: LocalBox): Box {
  const t = sideTangent(spot.side);
  const n = sideNormal(spot.side);
  return {
    centre: toWorld(spot, part.across, part.up, part.out),
    size: {
      x: Math.abs(t.x) * part.size.x + Math.abs(n.x) * part.size.z,
      y: part.size.y,
      z: Math.abs(t.z) * part.size.x + Math.abs(n.z) * part.size.z,
    },
  };
}

function worldQuad(spot: InteractionSpot, quad: LocalQuad): GlowQuad {
  const w = quad.width / 2;
  const h = quad.height / 2;
  const at = (sa: number, su: number): Vec3 =>
    toWorld(spot, quad.across + sa * w, quad.up + su * h, quad.out);
  return {
    corners: [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)],
    normal: sideNormal(spot.side),
    vMin: quad.vMin,
    vMax: quad.vMax,
  };
}

/** The cabinet standing in the front side's spot. */
export function cabinetLayout(side: Side = CABINET_SIDE): CabinetLayout {
  const spot = spotFor(side);
  return {
    side,
    id: spot.id,
    spot,
    parts: PARTS.map((part) => worldBox(spot, part)),
    faces: [worldQuad(spot, MARQUEE), worldQuad(spot, SCREEN)],
    screenCentre: toWorld(spot, SCREEN.across, SCREEN.up, SCREEN.out),
  };
}

/** Where the camera stops to look straight at the cabinet's screen. */
export function screenViewPose(
  layout: CabinetLayout = cabinetLayout(),
): CameraPose {
  return {
    target: layout.screenCentre,
    orbit: {
      azimuthRad: sideAzimuthRad(layout.side),
      polarRad: SCREEN_VIEW.polarRad,
      distanceM: SCREEN_VIEW.distanceM,
    },
  };
}

/**
 * Vertex data for the glowing faces as one mesh: each quad maps the full texture width
 * and its own band of rows.
 */
export function glowGeometryData(faces: readonly GlowQuad[]): GeometryData {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const face of faces) {
    const base = positions.length / 3;
    const faceUvs = [
      [0, face.vMin],
      [1, face.vMin],
      [1, face.vMax],
      [0, face.vMax],
    ] as const;
    face.corners.forEach((corner, i) => {
      positions.push(corner.x, corner.y, corner.z);
      normals.push(face.normal.x, face.normal.y, face.normal.z);
      const uv = faceUvs[i] ?? [0, 0];
      uvs.push(uv[0], uv[1]);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, uvs, indices };
}
