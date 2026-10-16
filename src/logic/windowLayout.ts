/**
 * Windows and doors round the building (task 20): frames, sills, glass, planks over the
 * boarded windows, the shop door, two back doors and a fire-escape door with its landing
 * and ladder. They all join the details mesh (`withWindows`), so they cost no draw call:
 * frames, planks and doors are lit boxes in the metal material, and each pane is a quad
 * mapped to its window cell of the details atlas (the emissive map), so lit glass glows
 * dimly and dark glass stays dark. Pure numbers in metres; where the openings are is in
 * `buildingLayout` (`wallOpenings`).
 */

import {
  WINDOW,
  pointOnSide,
  sideNormal,
  wallOpenings,
  type Side,
  type Vec3,
  type WallOpening,
  type WindowLook,
} from "./buildingLayout";
import {
  wallBox,
  type DetailBeam,
  type DetailBox,
  type DetailLayout,
  type WindowCellId,
  type WindowGlass,
} from "./detailLayout";
import { flashing } from "./neonFlicker";

/** Depths and sizes of the door and fire-escape parts, in metres. */
export const DOOR_PARTS = {
  /** The frame stands this far off the wall, the leaf this much further. */
  frameDepthM: 0.03,
  leafDepthM: 0.02,
  /** Gap between a pane and the surface behind it. */
  paneGapM: 0.002,
  handleM: { across: 0.05, up: 0.14, out: 0.04 },
  /** Planks over a boarded window: height and thickness. */
  plankUpM: 0.18,
  plankOutM: 0.012,
} as const;

/**
 * Paint on the back wall sits this far out (the graffiti layer, `LAYER_OUT_M.tags` past the
 * spot's gap). Frames, planks and door leaves stay behind it, so the tags paint over the
 * doors and the boarded windows; only the sills stand proud.
 */
export const BACK_PAINT_OUT_M = 0.06;

export const FIRE_ESCAPE = {
  /** The landing: across the wall, out from it and its grating's thickness. */
  landing: { across: 1.7, out: 1.1, up: 0.06 },
  /** Out from the wall where the landing starts (clear of the floor band). */
  gapM: 0.15,
  railHeightM: 1,
  barM: 0.05,
  /** The drop ladder: its two rails along the wall, and how low it hangs. */
  ladderAlongM: [0.45, 0.8],
  ladderBottomY: 2.6,
  rungStepM: 0.3,
} as const;

/** The window cell a pane shows: lit, shaded and silhouette cells come in each light. */
export function windowCell(opening: WallOpening): WindowCellId {
  const look: WindowLook = opening.look;
  if (look === "dark" || look === "boarded") return "dark";
  if (look === "broken") return "broken";
  return `${look}-${opening.light}`;
}

/** A quad on a side's wall, `outM` off it, over an along/up rectangle. */
function paneQuad(
  side: Side,
  minAlong: number,
  maxAlong: number,
  minY: number,
  maxY: number,
  outM: number,
): WindowGlass["quad"] {
  const at = (along: number, y: number): Vec3 =>
    pointOnSide(side, along, y, outM);
  return {
    corners: [
      at(minAlong, minY),
      at(maxAlong, minY),
      at(maxAlong, maxY),
      at(minAlong, maxY),
    ],
    normal: sideNormal(side),
    uMin: 0,
    uMax: 1,
    vMin: 0,
    vMax: 1,
  };
}

type Parts = {
  boxes: DetailBox[];
  beams: DetailBeam[];
  glass: WindowGlass[];
};

function windowParts(o: WallOpening): Parts {
  const w = WINDOW;
  const boxes: DetailBox[] = [
    // The frame: a slab a little larger than the glass, standing off the wall.
    {
      kind: "frame",
      box: wallBox(o.side, o.alongM, o.bottomY, {
        across: o.widthM,
        up: o.heightM,
        out: w.frameDepthM,
      }),
    },
    // The sill under it.
    {
      kind: "frame",
      box: wallBox(o.side, o.alongM, o.bottomY - w.sillHeightM, {
        across: o.widthM + 2 * w.sillOverhangM,
        up: w.sillHeightM,
        out: w.sillDepthM,
      }),
    },
  ];
  if (o.look === "boarded") {
    // Three planks, the middle one shorter and off-centre, nailed over the frame.
    const planks = [
      { up: 0.22, shift: 0, extra: 0.06 },
      { up: 0.5, shift: 0.08, extra: -0.12 },
      { up: 0.76, shift: -0.04, extra: 0.04 },
    ];
    for (const plank of planks)
      boxes.push({
        kind: "board",
        box: wallBox(
          o.side,
          o.alongM + plank.shift,
          o.bottomY + plank.up * o.heightM - DOOR_PARTS.plankUpM / 2,
          {
            across: o.widthM + plank.extra,
            up: DOOR_PARTS.plankUpM,
            out: DOOR_PARTS.plankOutM,
          },
          w.frameDepthM + 0.002,
        ),
      });
  }
  const glass: WindowGlass[] = [
    {
      cell: windowCell(o),
      flicker: o.flicker,
      quad: paneQuad(
        o.side,
        o.alongM - o.widthM / 2 + w.frameM,
        o.alongM + o.widthM / 2 - w.frameM,
        o.bottomY + w.frameM,
        o.bottomY + o.heightM - w.frameM,
        w.frameDepthM + DOOR_PARTS.paneGapM,
      ),
    },
  ];
  return { boxes, beams: [], glass };
}

function doorParts(o: WallOpening): Parts {
  const d = DOOR_PARTS;
  const frame = WINDOW.frameM;
  const leafOut = d.frameDepthM + d.leafDepthM;
  const leafWidth = o.widthM - 2 * frame;
  const boxes: DetailBox[] = [
    {
      kind: "frame",
      box: wallBox(o.side, o.alongM, o.bottomY, {
        across: o.widthM,
        up: o.heightM,
        out: d.frameDepthM,
      }),
    },
    {
      kind: "door",
      box: wallBox(
        o.side,
        o.alongM,
        o.bottomY,
        { across: leafWidth, up: o.heightM - frame, out: d.leafDepthM },
        d.frameDepthM,
      ),
    },
    // The handle, on the leaf's right.
    {
      kind: "metal",
      box: wallBox(
        o.side,
        o.alongM + leafWidth / 2 - 0.14,
        o.bottomY + 1,
        d.handleM,
        leafOut,
      ),
    },
  ];
  // The shop door has a glass panel in its upper half, lit from the shop.
  const glass: WindowGlass[] =
    o.door === "shop"
      ? [
          {
            cell: windowCell(o),
            flicker: false,
            quad: paneQuad(
              o.side,
              o.alongM - leafWidth / 2 + 0.1,
              o.alongM + leafWidth / 2 - 0.1,
              o.bottomY + 1.15,
              o.bottomY + o.heightM - frame - 0.12,
              leafOut + d.paneGapM,
            ),
          },
        ]
      : [];
  const extra = o.door === "fireEscape" ? fireEscapeParts(o) : undefined;
  return {
    boxes: [...boxes, ...(extra?.boxes ?? [])],
    beams: extra?.beams ?? [],
    glass,
  };
}

/**
 * The fire escape outside an upstairs door: a grated landing on two brackets, a rail round
 * its three open sides, and a drop ladder hanging from its front edge.
 */
export function fireEscapeParts(o: WallOpening): {
  boxes: DetailBox[];
  beams: DetailBeam[];
} {
  const f = FIRE_ESCAPE;
  const { side, alongM } = o;
  const floorY = o.bottomY;
  const half = f.landing.across / 2;
  const front = f.gapM + f.landing.out;
  const railY = floorY + f.railHeightM;
  const bar = f.barM;
  const boxes: DetailBox[] = [
    {
      kind: "plate",
      box: wallBox(
        side,
        alongM,
        floorY - f.landing.up,
        { across: f.landing.across, up: f.landing.up, out: f.landing.out },
        f.gapM,
      ),
    },
    // Top rails: along the front, and down each side back to the wall.
    {
      kind: "metal",
      box: wallBox(
        side,
        alongM,
        railY - bar,
        { across: f.landing.across, up: bar, out: bar },
        front - bar,
      ),
    },
    ...[-1, 1].map((s): DetailBox => ({
      kind: "metal",
      box: wallBox(
        side,
        alongM + s * (half - bar / 2),
        railY - bar,
        { across: bar, up: bar, out: f.landing.out - bar },
        f.gapM,
      ),
    })),
    // Posts at the front corners and halfway along each side.
    ...[
      [-1, front - bar],
      [1, front - bar],
      [-1, f.gapM + f.landing.out / 2],
      [1, f.gapM + f.landing.out / 2],
    ].map(([s = 0, out = 0]): DetailBox => ({
      kind: "metal",
      box: wallBox(
        side,
        alongM + s * (half - bar / 2),
        floorY,
        { across: bar, up: f.railHeightM - bar, out: bar },
        out,
      ),
    })),
  ];
  // The drop ladder: two rails from the landing's front edge down, and rungs between them.
  const [a0, a1] = f.ladderAlongM;
  const ladderOut = front - 2 * bar;
  const ladderTop = floorY - f.landing.up;
  for (const a of [a0, a1])
    boxes.push({
      kind: "metal",
      box: wallBox(
        side,
        alongM + a,
        f.ladderBottomY,
        { across: bar, up: ladderTop - f.ladderBottomY, out: bar },
        ladderOut,
      ),
    });
  for (let y = f.ladderBottomY + 0.15; y < ladderTop - 0.1; y += f.rungStepM)
    boxes.push({
      kind: "metal",
      box: wallBox(
        side,
        alongM + (a0 + a1) / 2,
        y,
        { across: a1 - a0, up: 0.03, out: 0.03 },
        ladderOut + 0.01,
      ),
    });
  // Two diagonal brackets from the wall up under the landing's front.
  const beams: DetailBeam[] = [-1, 1].map((s) => ({
    kind: "metal",
    from: pointOnSide(side, alongM + s * (half - 0.15), floorY - 1, 0.02),
    to: pointOnSide(
      side,
      alongM + s * (half - 0.15),
      floorY - f.landing.up - 0.02,
      front - 0.1,
    ),
    thicknessM: 0.06,
  }));
  return { boxes, beams };
}

/** Every window and door as detail parts, in `wallOpenings` order. */
export function windowLayout(
  openings: readonly WallOpening[] = wallOpenings(),
): Parts {
  const parts: Parts = { boxes: [], beams: [], glass: [] };
  for (const o of openings) {
    const p = o.kind === "door" ? doorParts(o) : windowParts(o);
    parts.boxes.push(...p.boxes);
    parts.beams.push(...p.beams);
    parts.glass.push(...p.glass);
  }
  return parts;
}

/**
 * The layout with the windows and doors added (task 20): their boxes after the layout's
 * own (so `withSignPlates`, applied after this, still puts the plates last), their beams
 * after its beams, and the panes in `glass`.
 */
export function withWindows(
  layout: DetailLayout,
  parts: Parts = windowLayout(),
): DetailLayout {
  return {
    boxes: [...layout.boxes, ...parts.boxes],
    beams: [...layout.beams, ...parts.beams],
    faces: layout.faces,
    glass: [...layout.glass, ...parts.glass],
  };
}

/** The flickering windows' own seed, so they don't dip in step with the skill signs. */
export const WINDOW_FLICKER_SEED = 0x51c4e3a1;

/**
 * Which of the flickering panes (an index into those flagged `flicker`, in order) is cut out
 * `timeMs` into the pattern, or undefined when all are lit. In the scene's shared flash
 * budget (`neonFlicker`), so nothing flashes more than 3 times a second together; steady
 * under reduced motion.
 */
export function dimmedWindow(
  timeMs: number,
  count: number,
  reducedMotion: boolean,
): number | undefined {
  return flashing(timeMs, "windows", WINDOW_FLICKER_SEED, count, reducedMotion);
}

/** The panes that flicker, as indexes into `glass`. */
export function flickeringPanes(glass: readonly WindowGlass[]): number[] {
  return glass.flatMap((pane, i) => (pane.flicker ? [i] : []));
}
