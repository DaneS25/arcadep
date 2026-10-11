/**
 * Layout of the building blockout, in metres (1 scene unit = 1 m). Pure data and maths,
 * shared by the scene (task 5), the camera (task 6) and picking (task 7).
 *
 * Frame: the building is centred on the origin with its base at y = 0. The front faces +z,
 * so "left" and "right" are as seen by a visitor standing in front of it: left is -x,
 * right is +x and the back (the alley) is -z. The street corner is in front and to the
 * right; the alley runs along the back.
 */

export type Vec3 = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type Side = "front" | "left" | "back" | "right";

/** The four sides in visiting order: each one is a quarter turn further round than the last. */
export const SIDES: readonly Side[] = ["front", "left", "back", "right"];

export const BUILDING = {
  /** Along x (front and back walls). */
  widthM: 12,
  /** Along z (left and right walls). */
  depthM: 10,
  /** Ground floor (cafe and arcade), first floor (arcade level), second floor (apartments). */
  floorHeightsM: [4.5, 4, 4],
  /** Trim band at each floor line, sticking out past the walls. */
  bandHeightM: 0.3,
  bandOverhangM: 0.15,
  /** Roof slab on top of the second floor. */
  roofThicknessM: 0.3,
  parapetHeightM: 1,
  parapetThicknessM: 0.3,
} as const;

export const STREET = {
  /** Pavement around the front, left and right of the building. */
  sidewalkWidthM: 3,
  curbHeightM: 0.15,
  /** Gap between the back wall and the wall across the alley. */
  alleyWidthM: 4,
  alleyWallHeightM: 5,
  alleyWallThicknessM: 0.4,
  /** How far the alley wall runs past each side of the building. */
  alleyWallOverrunM: 4,
} as const;

/** Axis-aligned rectangle on the ground (x and z). */
export type Rect = {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
};

/** A box given by its centre and full size. */
export type Box = { readonly centre: Vec3; readonly size: Vec3 };

export type FloorLevel = {
  readonly index: number;
  readonly baseY: number;
  readonly heightM: number;
  readonly topY: number;
};

type SideFrame = {
  /** Unit vector pointing out of the wall, on the ground plane. */
  readonly normal: { readonly x: number; readonly z: number };
  /** Unit vector along the wall, to the right of a visitor facing it. */
  readonly tangent: { readonly x: number; readonly z: number };
  /** Angle of the normal around +y, measured from +z towards +x. */
  readonly azimuthRad: number;
};

const SIDE_FRAMES: Readonly<Record<Side, SideFrame>> = {
  front: { normal: { x: 0, z: 1 }, tangent: { x: 1, z: 0 }, azimuthRad: 0 },
  right: {
    normal: { x: 1, z: 0 },
    tangent: { x: 0, z: -1 },
    azimuthRad: Math.PI / 2,
  },
  back: {
    normal: { x: 0, z: -1 },
    tangent: { x: -1, z: 0 },
    azimuthRad: Math.PI,
  },
  left: {
    normal: { x: -1, z: 0 },
    tangent: { x: 0, z: 1 },
    azimuthRad: (3 * Math.PI) / 2,
  },
};

/** The outward normal of a side's wall, on the ground plane. */
export function sideNormal(side: Side): Vec3 {
  const { normal } = SIDE_FRAMES[side];
  return { x: normal.x, y: 0, z: normal.z };
}

/** Direction along a side's wall, to the right of a visitor facing it. */
export function sideTangent(side: Side): Vec3 {
  const { tangent } = SIDE_FRAMES[side];
  return { x: tangent.x, y: 0, z: tangent.z };
}

/** Angle of a side's outward normal around +y, from +z towards +x, in [0, 2π). */
export function sideAzimuthRad(side: Side): number {
  return SIDE_FRAMES[side].azimuthRad;
}

/** Width of a side's wall (front and back span the width, left and right the depth). */
export function sideWidthM(side: Side): number {
  return side === "front" || side === "back"
    ? BUILDING.widthM
    : BUILDING.depthM;
}

/** Distance from the building's centre line to a side's wall. */
function sideOffsetM(side: Side): number {
  return side === "front" || side === "back"
    ? BUILDING.depthM / 2
    : BUILDING.widthM / 2;
}

/** Each floor's base and top height, ground floor first. */
export function floorLevels(): FloorLevel[] {
  let baseY = 0;
  return BUILDING.floorHeightsM.map((heightM, index) => {
    const level = { index, baseY, heightM, topY: baseY + heightM };
    baseY = level.topY;
    return level;
  });
}

/** Height of the walls, from the ground to the top of the second floor. */
export function wallHeightM(): number {
  return BUILDING.floorHeightsM.reduce((sum, h) => sum + h, 0);
}

/** Height of the very top of the building (roof slab plus parapet). */
export function buildingHeightM(): number {
  return wallHeightM() + BUILDING.roofThicknessM + BUILDING.parapetHeightM;
}

/** One solid box per floor, ground floor first. */
export function floorBoxes(): Box[] {
  return floorLevels().map((level) => ({
    centre: { x: 0, y: level.baseY + level.heightM / 2, z: 0 },
    size: { x: BUILDING.widthM, y: level.heightM, z: BUILDING.depthM },
  }));
}

/** A trim band at each line between two floors, sticking out past the walls. */
export function bandBoxes(): Box[] {
  const overhang = 2 * BUILDING.bandOverhangM;
  return floorLevels()
    .slice(0, -1)
    .map((level) => ({
      centre: { x: 0, y: level.topY, z: 0 },
      size: {
        x: BUILDING.widthM + overhang,
        y: BUILDING.bandHeightM,
        z: BUILDING.depthM + overhang,
      },
    }));
}

/** The roof slab, then the four parapet walls standing on its edges (front, back, left, right). */
export function roofBoxes(): Box[] {
  const { widthM: w, depthM: d, parapetThicknessM: t } = BUILDING;
  const slabTop = wallHeightM() + BUILDING.roofThicknessM;
  const y = slabTop + BUILDING.parapetHeightM / 2;
  const h = BUILDING.parapetHeightM;
  return [
    {
      centre: { x: 0, y: wallHeightM() + BUILDING.roofThicknessM / 2, z: 0 },
      size: { x: w, y: BUILDING.roofThicknessM, z: d },
    },
    { centre: { x: 0, y, z: d / 2 - t / 2 }, size: { x: w, y: h, z: t } },
    { centre: { x: 0, y, z: -d / 2 + t / 2 }, size: { x: w, y: h, z: t } },
    {
      centre: { x: -w / 2 + t / 2, y, z: 0 },
      size: { x: t, y: h, z: d - 2 * t },
    },
    {
      centre: { x: w / 2 - t / 2, y, z: 0 },
      size: { x: t, y: h, z: d - 2 * t },
    },
  ];
}

/** The pavement slab, from the ground up to the kerb height. */
export function sidewalkBox(): Box {
  const r = sidewalkRect();
  return {
    centre: {
      x: (r.minX + r.maxX) / 2,
      y: STREET.curbHeightM / 2,
      z: (r.minZ + r.maxZ) / 2,
    },
    size: { x: r.maxX - r.minX, y: STREET.curbHeightM, z: r.maxZ - r.minZ },
  };
}

/** The building's walls on the ground. */
export function buildingFootprint(): Rect {
  return {
    minX: -BUILDING.widthM / 2,
    maxX: BUILDING.widthM / 2,
    minZ: -BUILDING.depthM / 2,
    maxZ: BUILDING.depthM / 2,
  };
}

/** The pavement: wraps the front, left and right of the building; the back opens onto the alley. */
export function sidewalkRect(): Rect {
  const w = STREET.sidewalkWidthM;
  const fp = buildingFootprint();
  return {
    minX: fp.minX - w,
    maxX: fp.maxX + w,
    minZ: fp.minZ,
    maxZ: fp.maxZ + w,
  };
}

/** The alley floor between the back wall and the wall across from it. */
export function alleyRect(): Rect {
  const fp = buildingFootprint();
  const overrun = STREET.alleyWallOverrunM;
  return {
    minX: fp.minX - overrun,
    maxX: fp.maxX + overrun,
    minZ: fp.minZ - STREET.alleyWidthM,
    maxZ: fp.minZ,
  };
}

/** The wall across the alley from the building's back. */
export function alleyWallBox(): Box {
  const alley = alleyRect();
  const t = STREET.alleyWallThicknessM;
  return {
    centre: {
      x: (alley.minX + alley.maxX) / 2,
      y: STREET.alleyWallHeightM / 2,
      z: alley.minZ - t / 2,
    },
    size: {
      x: alley.maxX - alley.minX,
      y: STREET.alleyWallHeightM,
      z: t,
    },
  };
}

/** Whether a ground point is inside a rectangle (edges count as inside). */
export function rectContains(rect: Rect, x: number, z: number): boolean {
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
}

/**
 * A point in front of a side's wall: `alongM` to the right of the wall's centre (as seen
 * facing it), at height `y`, and `outM` out from the wall's surface.
 */
export function pointOnSide(
  side: Side,
  alongM: number,
  y: number,
  outM: number,
): Vec3 {
  const { normal, tangent } = SIDE_FRAMES[side];
  const out = sideOffsetM(side) + outM;
  return {
    x: normal.x * out + tangent.x * alongM,
    y,
    z: normal.z * out + tangent.z * alongM,
  };
}

export type InteractionSpot = {
  readonly side: Side;
  /** Id that picking (task 7) registers and the app logic acts on. */
  readonly id: `spot-${Side}`;
  /** Centre of the marker. */
  readonly position: Vec3;
  /**
   * Marker size in the side's own frame: `x` along the wall, `y` up, `z` out from the wall.
   */
  readonly size: Vec3;
};

type SpotPlacement = {
  readonly alongM: number;
  /** Height of the marker's bottom above the ground. */
  readonly bottomY: number;
  /** Gap between the wall and the marker's back face. */
  readonly gapM: number;
  readonly size: Vec3;
};

const SPOT_PLACEMENTS: Readonly<Record<Side, SpotPlacement>> = {
  // Arcade cabinet standing on the pavement, left of the storefront's centre.
  front: {
    alongM: -3,
    bottomY: STREET.curbHeightM,
    gapM: 0.3,
    size: { x: 0.8, y: 1.8, z: 0.8 },
  },
  // Cluster of neon signs on the first floor.
  left: {
    alongM: 0,
    bottomY: 5,
    gapM: 0.1,
    size: { x: 5, y: 3, z: 0.2 },
  },
  // Graffiti and project posters on the ground floor of the alley wall.
  back: {
    alongM: 0,
    bottomY: 0.6,
    gapM: 0.05,
    size: { x: 8, y: 3, z: 0.1 },
  },
  // Door terminal at hand height beside the side door.
  right: {
    alongM: 2,
    bottomY: 1.1,
    gapM: 0.05,
    size: { x: 0.5, y: 0.7, z: 0.15 },
  },
};

/** Where each side's interaction marker sits, in visiting order. */
export function interactionSpots(): InteractionSpot[] {
  return SIDES.map((side) => {
    const p = SPOT_PLACEMENTS[side];
    return {
      side,
      id: `spot-${side}`,
      position: pointOnSide(
        side,
        p.alongM,
        p.bottomY + p.size.y / 2,
        p.gapM + p.size.z / 2,
      ),
      size: p.size,
    };
  });
}
