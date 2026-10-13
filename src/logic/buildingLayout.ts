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
  /**
   * A low, waist-high wall across the alley (task 19): the 5 m wall it replaced hid the
   * graffiti from the street side, but a kerb wall still closes the alley off.
   */
  alleyWallHeightM: 1.1,
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
export function sideOffsetM(side: Side): number {
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

/** The low wall across the alley from the building's back. */
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

/**
 * How much bigger the arcade cabinet is than a real one (0.8 x 1.8 x 0.8 m), so it reads
 * from the street (task 21). `logic/cabinetLayout.ts` scales its parts by the same factor.
 */
export const CABINET_SCALE = 2;

const SPOT_PLACEMENTS: Readonly<Record<Side, SpotPlacement>> = {
  // Arcade cabinet standing on the pavement, left of the storefront's centre.
  front: {
    // Centred in the 2.2 m of wall between the two shop windows either side.
    alongM: -3.2,
    bottomY: STREET.curbHeightM,
    gapM: 0.3,
    size: {
      x: 0.8 * CABINET_SCALE,
      y: 1.8 * CABINET_SCALE,
      z: 0.8 * CABINET_SCALE,
    },
  },
  // Cluster of neon signs on the first floor.
  left: {
    alongM: 0,
    bottomY: 5,
    gapM: 0.1,
    size: { x: 5, y: 3, z: 0.2 },
  },
  // Project posters on the ground floor of the back wall (the graffiti spreads round them).
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

/**
 * Windows and doors (task 20). Each opening is a rectangle on one side's wall, measured as
 * the other wall props are: `alongM` to the right of the wall's centre (as seen facing it)
 * and `bottomY` up from the ground. The rectangle is the opening's outer frame, so anything
 * painted or mounted on the wall keeps out of it. The scene builds them in the details mesh
 * (`logic/windowLayout.ts`); the graffiti leaves the back wall's glass clear.
 */
export type WindowLook =
  /** Lit from inside. */
  | "lit"
  /** Lit, through half-closed blinds. */
  | "blinds"
  /** Lit, with someone (or something) standing in it. */
  | "silhouette"
  /** Unlit glass. */
  | "dark"
  /** Cracked and holed glass, unlit. */
  | "broken"
  /** Planks over dark glass; the graffiti paints over them. */
  | "boarded";

/** The colour of the light inside: dim purple, dim red or a cold fluorescent white-blue. */
export type WindowLight = "purple" | "red" | "cold";

export type DoorKind = "shop" | "back" | "fireEscape";

export type WallOpening = {
  readonly kind: "window" | "door";
  /** What sort of door it is (doors only). */
  readonly door?: DoorKind;
  readonly side: Side;
  /** Floor index, ground floor 0. */
  readonly floor: number;
  readonly alongM: number;
  readonly bottomY: number;
  readonly widthM: number;
  readonly heightM: number;
  /** A door's look is its glass panel's, if it has one (the shop door). */
  readonly look: WindowLook;
  readonly light: WindowLight;
  /** A tired fluorescent tube that now and then cuts out (never over 3 times a second). */
  readonly flicker: boolean;
};

export const WINDOW = {
  /** An ordinary upper-floor window, frame included. */
  widthM: 1.1,
  heightM: 1.6,
  /** Shop and ground-floor windows are taller. */
  groundHeightM: 2,
  /** Bottom of a window above its floor's base. */
  sillAboveFloorM: 1,
  /** Ground floor: above the pavement (or the alley floor). */
  groundSillAboveFloorM: 0.75,
  /** Frame border round the glass, and how far the frame stands off the wall. */
  frameM: 0.08,
  frameDepthM: 0.04,
  /** Sill under the frame: overhang each side, height and depth off the wall. */
  sillOverhangM: 0.08,
  sillHeightM: 0.06,
  sillDepthM: 0.12,
} as const;

export const DOOR = {
  widthM: 1.1,
  heightM: 2.3,
} as const;

type OpeningSpec = {
  readonly widthM?: number;
  readonly heightM?: number;
  readonly light?: WindowLight;
  readonly flicker?: boolean;
};

/** The ground under a ground-floor opening: the pavement, or the alley floor at the back. */
function groundY(side: Side): number {
  return side === "back" ? 0 : STREET.curbHeightM;
}

function windowAt(
  side: Side,
  floor: number,
  alongM: number,
  look: WindowLook,
  spec: OpeningSpec = {},
): WallOpening {
  const ground = floor === 0;
  const base = ground ? groundY(side) : (floorLevels()[floor]?.baseY ?? 0);
  return {
    kind: "window",
    side,
    floor,
    alongM,
    bottomY:
      base + (ground ? WINDOW.groundSillAboveFloorM : WINDOW.sillAboveFloorM),
    widthM: spec.widthM ?? WINDOW.widthM,
    heightM: spec.heightM ?? (ground ? WINDOW.groundHeightM : WINDOW.heightM),
    look,
    light: spec.light ?? "purple",
    flicker: spec.flicker ?? false,
  };
}

function doorAt(
  side: Side,
  floor: number,
  alongM: number,
  door: DoorKind,
  look: WindowLook,
  spec: OpeningSpec = {},
): WallOpening {
  // On the pavement or the alley floor, or upstairs just over the floor band.
  const bottomY =
    floor === 0
      ? groundY(side)
      : (floorLevels()[floor]?.baseY ?? 0) + BUILDING.bandHeightM / 2;
  return {
    kind: "door",
    door,
    side,
    floor,
    alongM,
    bottomY,
    widthM: spec.widthM ?? DOOR.widthM,
    heightM: spec.heightM ?? DOOR.heightM,
    look,
    light: spec.light ?? "purple",
    flicker: false,
  };
}

/**
 * Every window and door round the building, side by side and floor by floor. Placed by
 * hand round the props already on each wall (AC units, vents, pipes, signs, neon and the
 * interaction spots); a test checks none of them overlap. The flickering windows are all on
 * the right side, which never shares a view with the flickering skill signs on the left.
 */
export function wallOpenings(): WallOpening[] {
  return [
    // Front: the shop on the ground floor, then two floors of flats.
    windowAt("front", 0, -4.9, "blinds", { widthM: 1.2 }),
    windowAt("front", 0, -1.3, "lit", { widthM: 1.6, light: "red" }),
    doorAt("front", 0, 0.6, "shop", "lit", { widthM: 1 }),
    windowAt("front", 0, 2.6, "lit", { widthM: 2, light: "cold" }),
    windowAt("front", 1, -4.5, "lit"),
    windowAt("front", 1, -2.5, "dark"),
    windowAt("front", 1, 0, "blinds", { light: "red" }),
    windowAt("front", 1, 2.5, "silhouette", { light: "cold" }),
    windowAt("front", 1, 4.5, "broken"),
    windowAt("front", 2, -5.3, "dark", { widthM: 0.9 }),
    windowAt("front", 2, -2.5, "lit", { light: "red" }),
    windowAt("front", 2, 0, "boarded"),
    windowAt("front", 2, 2.5, "blinds"),
    windowAt("front", 2, 5.1, "silhouette", { widthM: 0.9 }),
    // Left: round the skill signs on the first floor.
    windowAt("left", 0, -3, "dark", { widthM: 1.2 }),
    windowAt("left", 0, -0.6, "lit", { widthM: 1.4, light: "cold" }),
    windowAt("left", 0, 4, "blinds", { light: "red" }),
    windowAt("left", 1, -3.9, "silhouette", { widthM: 1 }),
    windowAt("left", 1, 3.9, "dark", { widthM: 1 }),
    windowAt("left", 2, -1.5, "lit"),
    windowAt("left", 2, 0.6, "broken"),
    windowAt("left", 2, 4.3, "blinds", { widthM: 0.9, light: "cold" }),
    // Back: two back doors either side of the poster row, a fire-escape door, and windows
    // that are mostly boarded or broken (the alley side gets the worst of it).
    doorAt("back", 0, -4.75, "back", "dark", { widthM: 1 }),
    doorAt("back", 0, 4.75, "back", "dark", { widthM: 1 }),
    windowAt("back", 1, -4.6, "boarded", { widthM: 1 }),
    windowAt("back", 1, -1.2, "lit", { light: "red" }),
    windowAt("back", 1, 0.9, "broken"),
    doorAt("back", 1, 4.5, "fireEscape", "dark", { widthM: 1, heightM: 2.1 }),
    windowAt("back", 2, -3.4, "silhouette"),
    windowAt("back", 2, 1.2, "dark"),
    windowAt("back", 2, 5, "boarded", { widthM: 0.8 }),
    // Right: the terminal's side door is its own prop (`terminalLayout`).
    windowAt("right", 0, -2, "dark", { widthM: 1.4 }),
    windowAt("right", 0, 3.9, "lit", {
      widthM: 1.2,
      light: "cold",
      flicker: true,
    }),
    windowAt("right", 1, 0.8, "lit", { light: "cold", flicker: true }),
    windowAt("right", 1, 2.8, "blinds"),
    windowAt("right", 1, 4.4, "silhouette", { widthM: 0.8, light: "cold" }),
    windowAt("right", 2, -3.9, "lit", { light: "cold", flicker: true }),
    windowAt("right", 2, -1.6, "boarded"),
    windowAt("right", 2, 0.6, "dark"),
    windowAt("right", 2, 4.2, "blinds", { light: "red" }),
  ];
}

/** A rectangle on one side's wall: along it (to the right, facing it) and up. */
export type WallRect = {
  readonly side: Side;
  readonly minAlong: number;
  readonly maxAlong: number;
  readonly minY: number;
  readonly maxY: number;
};

/** An opening's outer frame on its wall. */
export function openingRect(opening: WallOpening): WallRect {
  return {
    side: opening.side,
    minAlong: opening.alongM - opening.widthM / 2,
    maxAlong: opening.alongM + opening.widthM / 2,
    minY: opening.bottomY,
    maxY: opening.bottomY + opening.heightM,
  };
}

/**
 * The frames of clear or lit glass on one side: every window but the boarded ones. The
 * back wall's graffiti stops at these frames (task 19 review); doors and boarded windows
 * get painted over.
 */
export function glassRects(side: Side): WallRect[] {
  return wallOpenings()
    .filter(
      (o) => o.side === side && o.kind === "window" && o.look !== "boarded",
    )
    .map(openingRect);
}
