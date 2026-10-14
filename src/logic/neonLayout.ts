import {
  BUILDING,
  floorLevels,
  pointOnSide,
  sideNormal,
  sideTangent,
  wallHeightM,
  type Box,
  type Side,
} from "./buildingLayout";

/** Which palette token a neon tube glows in: red is the main accent, cyan and deep purple the secondary ones. */
export type NeonColor = "accent" | "cyan" | "purple";

export type NeonStrip = {
  readonly name: string;
  readonly color: NeonColor;
  readonly box: Box;
};

export const NEON = {
  /** Square cross-section of a tube. */
  thicknessM: 0.08,
  /** How far below a trim band a strip runs, measured from the band's underside. */
  belowBandM: 0.1,
} as const;

const T = NEON.thicknessM;
/** Centre of a tube that touches the wall's surface. */
const OUT = T / 2;

/** A horizontal tube along a side's wall, from `fromM` to `toM` (to the right, facing the wall). */
function horizontal(
  name: string,
  color: NeonColor,
  side: Side,
  fromM: number,
  toM: number,
  y: number,
  outM: number = OUT,
): NeonStrip {
  const t = sideTangent(side);
  const n = sideNormal(side);
  const length = Math.abs(toM - fromM);
  return {
    name,
    color,
    box: {
      centre: pointOnSide(side, (fromM + toM) / 2, y, outM),
      size: {
        x: Math.abs(t.x) * length + Math.abs(n.x) * T,
        y: T,
        z: Math.abs(t.z) * length + Math.abs(n.z) * T,
      },
    },
  };
}

/** A vertical tube on a building corner, just outside both walls. */
function corner(
  name: string,
  color: NeonColor,
  xSign: 1 | -1,
  zSign: 1 | -1,
  fromY: number,
  toY: number,
): NeonStrip {
  return {
    name,
    color,
    box: {
      centre: {
        x: xSign * (BUILDING.widthM / 2 + OUT),
        y: (fromY + toY) / 2,
        z: zSign * (BUILDING.depthM / 2 + OUT),
      },
      size: { x: T, y: toY - fromY, z: T },
    },
  };
}

/**
 * The purple tube (task 26: the utility pole it hung on is gone): up the back wall's corner
 * on the alley's right as seen from the alley (+x), where it lights the alley and the
 * posters' end without standing on the pavement or over a door, window or poster.
 */
export const BACK_TUBE = { xSign: 1, fromY: 1.1, toY: 3.9 } as const;

/**
 * The building's neon tubes: red lines under the floor bands and up the front corners,
 * a red line along the front parapet, plus cyan over the side door and on the left, and
 * purple up a back corner. One draw call in the scene (instanced).
 */
export function neonStrips(): NeonStrip[] {
  const [ground, first] = floorLevels();
  const groundTop = ground?.topY ?? 0;
  const firstTop = first?.topY ?? 0;
  const underBand = (topY: number): number =>
    topY - BUILDING.bandHeightM / 2 - NEON.belowBandM - T / 2;
  const halfW = BUILDING.widthM / 2;
  const halfD = BUILDING.depthM / 2;
  const inset = 0.4;
  const top = wallHeightM();
  const parapetY =
    top + BUILDING.roofThicknessM + BUILDING.parapetHeightM - 0.15;

  return [
    horizontal(
      "front-band",
      "accent",
      "front",
      -halfW + inset,
      halfW - inset,
      underBand(groundTop),
    ),
    horizontal("front-parapet", "accent", "front", -halfW, halfW, parapetY),
    corner("front-left-corner", "accent", -1, 1, 0.3, top - 0.1),
    corner("front-right-corner", "accent", 1, 1, 0.3, top - 0.1),
    horizontal(
      "left-band",
      "cyan",
      "left",
      -halfD + inset,
      halfD - inset,
      underBand(groundTop),
    ),
    horizontal(
      "right-band",
      "accent",
      "right",
      -halfD + inset,
      halfD - inset,
      underBand(firstTop),
    ),
    horizontal("right-door", "cyan", "right", 0, 2.6, 3.2),
    horizontal(
      "back-band",
      "accent",
      "back",
      -halfW + inset,
      halfW - inset,
      underBand(groundTop),
    ),
    corner(
      "back-corner",
      "purple",
      BACK_TUBE.xSign,
      -1,
      BACK_TUBE.fromY,
      BACK_TUBE.toY,
    ),
  ];
}
