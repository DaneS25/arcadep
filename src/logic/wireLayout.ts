/**
 * Overhead wires (task 29): thin, single cables strung haphazardly across the walls, slung
 * between the floors, draped over the parapet and across the roof's well, with only two
 * small bundles. A few loose ends dangle down the walls, a handful run into windows, and one
 * cable from each of the generator's conduit ports (task 28) runs along the left wall and
 * round to the front, as if the flats are tapping it. Round 2's 242 strands read as a thick,
 * bunched mass, so the user asked for far fewer and thinner ones (2026-10-16).
 *
 * Each wire is a run of strands between anchors, and every anchor is on the building: a
 * wall bracket, a parapet hook or saddle, a generator port, a loose end resting against the
 * wall or a window's pane, so nothing trails off into the dark. The runs keep to where no
 * sight line to a clickable item passes (the tests check every camera stop, close-up and
 * sampled orbit):
 * - front and right walls: closer to the wall than the shop signs' faces, the cabinet's
 *   screen and the terminal's screen, so every sight line to them stays in front;
 * - left wall: under the skill signs, whose sight lines all rise to the camera;
 * - roof: below the parapet's top, where the building itself hides every sight line;
 * - the back wall and the left wall above the band stay bare: from the free-look orbits the
 *   posters and the skill signs are seen across all of it.
 * The strands' spread, sag and thickness come from a seeded generator, so the tangle is the
 * same on every load.
 *
 * All of it joins the details mesh (`withWires`) as thin square beams and small bracket
 * boxes, so it costs no draw call. Pure numbers in metres.
 */

import {
  BUILDING,
  WINDOW,
  pointOnSide,
  type Side,
  type Vec3,
} from "./buildingLayout";
import {
  roofTopY,
  sagPoints,
  wallBox,
  type DetailBeam,
  type DetailBox,
  type DetailLayout,
} from "./detailLayout";
import { generatorPlugs } from "./generatorLayout";
import { createRng } from "./rng";

/** Sizes and the seed. */
export const WIRES = {
  seed: 0x29c0b1e5,
  /**
   * Strand thickness by kind of run: thin data lines, power cables, and the strands of the
   * two small bundles. All thinner than round 1's thinnest power cable (0.033 m), so they
   * read as stringy single cables (user, 2026-10-16).
   */
  thicknessM: {
    data: [0.012, 0.016],
    power: [0.017, 0.024],
    bundle: [0.025, 0.03],
  },
  /** How far each strand's ends wander round its anchor (a bundle's stay tight). */
  spreadM: { data: 0.05, power: 0.05, bundle: 0.04 },
  /** How far they wander out from (or in to) the wall, which stays small to keep clear of it. */
  outSpreadM: 0.03,
  /** How much more or less than its run each strand sags: unevenly, so it looks haphazard. */
  sagScale: { data: [0.4, 2], power: [0.4, 1.9], bundle: [0.85, 1.15] },
  /** Wall brackets: a square arm from the wall out to the wire. */
  bracketM: 0.07,
  /**
   * A strand's segments are at most this long, and a span has at most this many: few, fat
   * strands in few segments keep the vertex count low, which headless (software) WebGL feels.
   */
  segmentM: 0.9,
  maxSegments: 6,
} as const;

export type WireKind = keyof typeof WIRES.thicknessM;

/**
 * How a run can end without a bracket: a loose end hanging against the wall, or into a
 * window's opening, at its pane.
 */
export type WireEnd = "loose" | "window";

/**
 * Where a run is held: on a side's wall (along, up, out; a parapet saddle when `saddle`,
 * with `outM` negative on its inner edge; a free end when `end`, always a run's last), or a
 * point on the roof or a port.
 */
export type WireAnchor =
  | {
      readonly side: Side;
      readonly alongM: number;
      readonly y: number;
      readonly outM: number;
      readonly saddle?: true;
      readonly end?: WireEnd;
    }
  | { readonly at: Vec3; readonly hold: "hook" | "port" };

/** One wire route: its anchors in order, how many strands, what kind and how much they sag. */
export type WireRun = {
  readonly id: string;
  readonly kind: WireKind;
  readonly strands: number;
  /** Sag at a span's middle, as a fraction of its level length. */
  readonly sag: number;
  /** How far its strands' ends wander out from the wall, if not the usual. */
  readonly outSpreadM?: number;
  readonly path: readonly WireAnchor[];
};

/** One strand of a run: a sagging polyline. */
export type WireStrand = {
  readonly run: string;
  readonly kind: WireKind;
  readonly thicknessM: number;
  readonly points: readonly Vec3[];
};

/** Out from the wall on the front: behind the café sign's face (0.42 m) and the cabinet. */
const F = 0.25;
/** Out on the right: behind the terminal's screen (0.2 m) and the arcade sign's face. */
const R = 0.12;
/** Out on the left, under the skill signs: past the drain pipe (0.32 m). */
const L = 0.45;
/** Tier heights: under the first floor's band, under the second's, under the roof, on the parapet. */
const T1 = 3.95;
const T2 = 8.05;
const T3 = 12.2;
const TP = 13.2;
/** The left wall's tiers: over the cyan band tube and under the skill signs. */
const L0 = 4.0;
const L1 = 4.95;

const wall = (
  side: Side,
  alongM: number,
  y: number,
  outM: number,
): WireAnchor => ({ side, alongM, y, outM });
const front = (alongM: number, y: number, outM = F): WireAnchor =>
  wall("front", alongM, y, outM);
const right = (alongM: number, y: number, outM = R): WireAnchor =>
  wall("right", alongM, y, outM);
const left = (alongM: number, y: number, outM = L): WireAnchor =>
  wall("left", alongM, y, outM);

const ROOF_Y = roofTopY();
const PARAPET_Y = ROOF_Y + BUILDING.parapetHeightM;
const HALF_W = BUILDING.widthM / 2;
const HALF_D = BUILDING.depthM / 2;
const INNER = BUILDING.parapetThicknessM;

/** A hook on the parapet's inner face (clamped to it), 0.25 m under its top. */
const hook = (x: number, z: number): WireAnchor => ({
  at: {
    x: Math.max(-HALF_W + INNER + 0.08, Math.min(HALF_W - INNER - 0.08, x)),
    y: PARAPET_Y - 0.25,
    z: Math.max(-HALF_D + INNER + 0.08, Math.min(HALF_D - INNER - 0.08, z)),
  },
  hold: "hook",
});

/** How far a saddle's lips stand past the parapet's edges, and over its top. */
const LIP_M = 0.09;
/** The outer lip stands further out, past the front parapet's neon tube (0.08 m). */
const OUTER_LIP_M = 0.15;

/**
 * A saddle on top of a side's parapet, where a wire crosses it: held at its outer lip, then
 * its inner one, so the wire never cuts through the parapet's corner.
 */
const cap = (side: Side, alongM: number): WireAnchor[] =>
  [OUTER_LIP_M, -INNER - LIP_M].map((outM) => ({
    side,
    alongM,
    y: PARAPET_Y + LIP_M,
    outM,
    saddle: true,
  }));

/** Just the inner lip of a saddle, for a wire from the roof draped onto the parapet. */
const capInner = (side: Side, alongM: number): WireAnchor =>
  cap(side, alongM)[1] ?? { side, alongM, y: PARAPET_Y, outM: -INNER / 2 };

/** How far a loose end rests off the wall: just touching it, clear of the window frames. */
export const LOOSE_OUT_M = 0.06;
/** How far off the wall a wire into a window ends: just at its pane, inside the frame. */
export const INTO_WINDOW_OUT_M = WINDOW.frameDepthM + 0.02;

/** A loose end hanging down against a side's wall. */
const loose = (side: Side, alongM: number, y: number): WireAnchor => ({
  side,
  alongM,
  y,
  outM: LOOSE_OUT_M,
  end: "loose",
});

/** A wire's end into a window's opening on a side, at its pane. */
const into = (side: Side, alongM: number, y: number): WireAnchor => ({
  side,
  alongM,
  y,
  outM: INTO_WINDOW_OUT_M,
  end: "window",
});

const port = (i: number): WireAnchor => ({
  at: generatorPlugs()[i]?.position ?? { x: 0, y: 0, z: 0 },
  hold: "port",
});

/** A run, compactly. */
const run = (
  id: string,
  kind: WireKind,
  strands: number,
  sag: number,
  path: readonly WireAnchor[],
  outSpreadM?: number,
): WireRun =>
  outSpreadM === undefined
    ? { id, kind, strands, sag, path }
    : { id, kind, strands, sag, path, outSpreadM };

/** Where each generator feed goes on from the front-left corner: the front wall's tiers. */
const FEED_ENDS: readonly (readonly WireAnchor[])[] = [
  [front(-5.75, T2), front(-5.7, T3), front(-5.85, TP, 0.4)],
  [front(-5.75, T2), front(-3.5, T2 - 0.05)],
  [front(-5.7, T3), front(-3.4, T3 - 0.05)],
  [front(-4.1, T1 - 0.05, 0.2)],
  [front(-5.75, T2), front(-1.5, T2)],
];

/** Every run. Mostly single strands, so they read as stringy cables, with two small bundles. */
export const WIRE_RUNS: readonly WireRun[] = [
  // Front, over the ground floor: right across over the windows, door and cabinet.
  run("front-1", "power", 1, 0.2, [
    front(-5.7, T1, 0.2),
    front(-4.1, T1 - 0.05, 0.2),
    front(-2.3, T1, 0.2),
    front(-0.2, T1 - 0.03, 0.2),
    front(1.4, T1, 0.2),
    front(3.8, T1 - 0.05, 0.2),
    front(5.7, T1, 0.2),
  ]),
  run("front-1-data", "data", 1, 0.12, [
    front(-5.7, T1, 0.2),
    front(-2.3, T1, 0.2),
    front(1.4, T1, 0.2),
    front(5.7, T1, 0.2),
  ]),
  run("front-1-loop", "bundle", 3, 0.192, [
    front(-0.2, T1 - 0.03, 0.2),
    front(3.8, T1 - 0.05, 0.2),
  ]),
  // Front, first floor, under the band.
  run("front-2", "power", 2, 0.24, [
    front(-5.7, T2),
    front(-3.5, T2 - 0.05),
    front(-1.5, T2),
    front(0.4, T2 - 0.05),
    front(2.3, T2),
    front(4.1, T2 - 0.05),
    front(5.7, T2),
  ]),
  run("front-2-data", "data", 1, 0.384, [
    front(-5.7, T2),
    front(-1.5, T2),
    front(2.3, T2),
    front(5.7, T2),
  ]),
  run("front-2-loop", "data", 1, 0.272, [front(2.3, T2), front(5.7, T2)]),
  // Front, top floor, under the roof, and along the parapet.
  run("front-3", "power", 1, 0.24, [
    front(-5.7, T3),
    front(-3.4, T3 - 0.05),
    front(-1.6, T3),
    front(0.8, T3 - 0.05),
    front(2.9, T3),
    front(5.7, T3),
  ]),
  run("front-3-data", "data", 1, 0.2, [
    front(-5.7, T3),
    front(-1.6, T3),
    front(2.9, T3),
    front(5.7, T3),
  ]),
  run("front-3-loop", "power", 1, 0.32, [front(-5.7, T3), front(-1.6, T3)]),
  run("front-p", "power", 1, 0.128, [
    front(-5.85, TP, 0.4),
    front(-3, TP),
    front(0, TP + 0.05),
    front(3, TP),
    front(5.85, TP, 0.4),
  ]),
  // Front: drops slung between the floors.
  run("front-drop-1", "power", 1, 0.08, [
    front(-5.7, T1, 0.2),
    front(-3.5, T2 - 0.05),
    front(-1.6, T3),
  ]),
  run("front-drop-2", "power", 1, 0.08, [
    front(5.7, T1, 0.2),
    front(4.1, T2 - 0.05),
    front(2.3, T2),
    front(0.8, T3 - 0.05),
  ]),
  run("front-drop-3", "data", 1, 0.08, [
    front(-0.2, T1 - 0.03, 0.2),
    front(-1.5, T2),
    front(-3.4, T3 - 0.05),
  ]),
  run("front-drop-4", "power", 1, 0.064, [
    front(5.7, T2),
    front(5.7, T3),
    front(5.85, TP, 0.4),
  ]),
  run("front-drop-5", "data", 1, 0.096, [
    front(2.9, T3),
    front(3, TP),
    front(0, TP + 0.05),
  ]),
  run("front-cross-1", "power", 1, 0.096, [
    front(-4.1, T1 - 0.05, 0.2),
    front(-1.5, T2),
    front(0.4, T2 - 0.05),
  ]),
  run("front-cross-2", "data", 1, 0.128, [
    front(3.8, T1 - 0.05, 0.2),
    front(2.3, T2),
  ]),
  run("front-cross-3", "power", 1, 0.112, [
    front(-1.5, T2),
    front(-3.4, T3 - 0.05),
  ]),
  run("front-cross-4", "data", 1, 0.128, [
    front(0.4, T2 - 0.05),
    front(2.9, T3),
    front(5.7, T3),
  ]),
  // Tucked in at its top, behind the café sign's plate.
  run(
    "front-cross-5",
    "power",
    1,
    0.07,
    [front(-2.3, T1, 0.2), front(0.4, T2 - 0.05, 0.22)],
    0.02,
  ),
  // Front: loose ends hanging off the tiers, down against the wall between the windows.
  run("front-loose-1", "data", 1, 0.05, [
    front(-3.5, T2 - 0.05),
    loose("front", -3.38, 6.75),
  ]),
  run("front-loose-2", "power", 1, 0.05, [
    front(1.4, T1, 0.2),
    loose("front", 1.3, 3.15),
  ]),
  run("front-loose-3", "data", 1, 0.05, [
    front(5.7, T3),
    loose("front", 5.8, 10.3),
  ]),
  // Front: into the broken first-floor window and a lit flat on the top floor.
  run("front-in-1", "power", 1, 0.06, [
    front(4.1, T2 - 0.05),
    into("front", 4.25, 6.9),
  ]),
  run("front-in-2", "data", 1, 0.06, [
    front(-3.4, T3 - 0.05),
    into("front", -2.8, 10.9),
  ]),
  // Round the front-right corner on the parapet, and on along the right wall's.
  run("corner-front-right", "power", 1, 0.08, [
    front(5.85, TP, 0.4),
    right(-4.85, TP, 0.4),
  ]),
  // Right wall: the same tiers, tight to the wall.
  run(
    "right-1",
    "power",
    1,
    0.24,
    [
      right(-4.9, T1 + 0.05),
      right(-3.0, T1),
      right(-0.8, T1 + 0.05),
      right(1.7, T1),
      right(3.0, T1 + 0.05),
      right(4.85, T1),
    ],
    0.01,
  ),
  run(
    "right-1-data",
    "data",
    1,
    0.13,
    [right(-4.9, T1 + 0.05), right(-0.8, T1 + 0.05), right(3.0, T1 + 0.05)],
    0.01,
  ),
  run(
    "right-2",
    "bundle",
    3,
    0.2,
    [
      right(-4.8, T2 - 0.1),
      right(-3.05, T2 + 0.03),
      right(-2.45, T2 + 0.03),
      right(0.6, T2 - 0.1),
      right(1.8, T2 - 0.15),
      right(3.1, T2 - 0.15),
      right(4.85, T2 - 0.1),
    ],
    0.01,
  ),
  run(
    "right-2-data",
    "data",
    1,
    0.28,
    [
      right(-4.9, T2 - 0.1),
      right(-3.05, T2 + 0.03),
      right(-2.45, T2 + 0.03),
      right(0.6, T2 - 0.1),
      right(4.85, T2 - 0.1),
    ],
    0.01,
  ),
  run(
    "right-3",
    "power",
    1,
    0.2,
    [
      right(-4.85, T3),
      right(-3.05, T3 + 0.1),
      right(-2.45, T3 + 0.08),
      right(0.5, T3),
      right(1.6, T3),
      right(2.4, T3 - 0.05),
      right(4.85, T3),
    ],
    0.01,
  ),
  run(
    "right-3-data",
    "data",
    1,
    0.3,
    [
      right(-4.85, T3),
      right(-3.05, T3 + 0.1),
      right(-2.45, T3 + 0.08),
      right(0.5, T3),
      right(2.4, T3 - 0.05),
      right(4.85, T3),
    ],
    0.01,
  ),
  run(
    "right-p",
    "power",
    1,
    0.128,
    [right(-4.85, TP), right(-1.5, TP), right(1.5, TP + 0.05), right(4.85, TP)],
    0.01,
  ),
  run(
    "right-drop-1",
    "power",
    1,
    0.08,
    [right(-4.9, T1 + 0.05), right(-4.9, T2 - 0.1), right(-4.85, T3)],
    0.01,
  ),
  run(
    "right-drop-2",
    "power",
    1,
    0.08,
    // A touch further out than the rest, to clear the band's tube as it crosses it.
    [right(1.7, T1, 0.14), right(1.8, T2 - 0.15, 0.14), right(1.6, T3, 0.14)],
    0.01,
  ),
  run(
    "right-drop-3",
    "data",
    1,
    0.08,
    [right(4.95, T2 - 0.1), right(4.95, T3), right(4.95, TP)],
    0.01,
  ),
  run(
    "right-cross-1",
    "power",
    1,
    0.096,
    [right(-3.0, T1), right(-4.9, T2 - 0.1)],
    0.01,
  ),
  run(
    "right-cross-2",
    "data",
    1,
    0.128,
    [right(3.0, T1 + 0.05), right(4.85, T2 - 0.1)],
    0.01,
  ),
  run(
    "right-cross-3",
    "power",
    1,
    0.08,
    [right(0.6, T2 - 0.1, 0.14), right(-2.45, T3 + 0.08)],
    0.01,
  ),
  run(
    "right-cross-4",
    "data",
    1,
    0.128,
    [right(4.95, T3), right(1.5, TP + 0.05)],
    0.01,
  ),
  // Right: two loose ends, and two wires into the flats.
  run("right-loose-1", "data", 1, 0.05, [
    right(-4.85, T3),
    loose("right", -4.72, 10.4),
  ]),
  run("right-loose-2", "power", 1, 0.05, [
    right(3.0, T1 + 0.05),
    loose("right", 2.85, 3.1),
  ]),
  run("right-in-1", "data", 1, 0.06, [
    right(0.5, T3),
    into("right", 0.35, 10.9),
  ]),
  run("right-in-2", "power", 1, 0.06, [
    right(3.1, T2 - 0.15),
    into("right", 2.55, 6.9),
  ]),
  // Left wall: swags over the band tube and under the skill signs.
  run("left-0", "power", 1, 0.24, [
    left(-4.85, L0),
    left(-3.0, L0 - 0.05),
    left(-0.7, L0),
    left(0.25, L0 - 0.02),
  ]),
  run("left-0-data", "data", 1, 0.13, [
    left(-4.85, L0),
    left(-0.7, L0),
    left(0.25, L0 - 0.02),
  ]),
  run("left-1", "power", 1, 0.22, [
    left(-4.85, L1),
    left(-2.6, L1 - 0.03),
    left(-0.2, L1),
    left(2.1, L1 - 0.03),
    left(3.2, L1 - 0.03),
    left(4.9, L1),
  ]),
  run("left-1-data", "data", 1, 0.24, [
    left(-4.85, L1),
    left(-0.2, L1),
    left(2.1, L1 - 0.03),
    left(3.2, L1 - 0.03),
    left(4.9, L1),
  ]),
  run("left-drop", "power", 1, 0.064, [left(-4.85, L0), left(-4.85, L1)]),
  run("left-loose", "data", 1, 0.05, [
    left(-4.85, L0),
    loose("left", -4.7, 3.1),
  ]),
  // The generator's feeds, one cable a port: up to a clamp over the band, along under the
  // skill signs, round the front corner and on to the front wall's tiers.
  ...FEED_ENDS.map((ends, i): WireRun =>
    run(`feed-${String(i + 1)}`, "power", 1, 0.2, [
      port(i),
      i < 3 ? left(0.95 + 0.55 * i, L1, 0.3) : left(2.65 + 0.3 * (i - 3), L1),
      left(3.2, L1 - 0.03),
      left(4.9, L1),
      front(-5.9, L1, 0.45),
      ...ends,
    ]),
  ),
  // Over the parapet onto the roof.
  run("over-front-1", "power", 1, 0.05, [
    front(-5.2, T3),
    ...cap("front", -5.0),
    hook(-4.6, 3.8),
  ]),
  run("over-front-2", "data", 1, 0.05, [
    front(4.4, T3),
    ...cap("front", 4.6),
    hook(4.6, 4.7),
  ]),
  run("over-right-1", "power", 1, 0.05, [
    right(3.0, T3),
    ...cap("right", 3.2),
    hook(4.0, -3.0),
  ]),
  run("over-right-2", "data", 1, 0.05, [
    right(-1.5, TP),
    ...cap("right", -1.3),
    hook(4.3, 1.6),
  ]),
  // Across the roof, below the parapet's top: front to back and side to side.
  run("roof-1", "power", 1, 0.035, [hook(-5.2, 4.7), hook(-5.2, -4.7)]),
  run("roof-2", "data", 1, 0.035, [hook(4.6, 4.7), hook(4.6, -4.7)]),
  run("roof-3", "power", 2, 0.03, [hook(-5.7, 3.6), hook(5.7, 3.6)]),
  run("roof-4", "data", 1, 0.03, [hook(-5.7, -0.6), hook(5.7, -0.6)]),
  run("roof-5", "power", 1, 0.03, [hook(-5.7, -4.2), hook(5.7, -4.2)]),
  run("roof-6", "data", 1, 0.03, [hook(-3.6, 4.7), hook(-4.4, -4.7)]),
  run("roof-7", "power", 1, 0.035, [hook(-5.7, -0.9), hook(5.7, -1.2)]),
  // Draped over the left and back parapets from the roof.
  run("cap-left-1", "power", 1, 0.06, [
    capInner("left", 0.6),
    hook(-3.6, 0.4),
    hook(-1.8, 4.7),
  ]),
  // No masts: they crossed the rooftop sign from some orbits, so these all stay in the well.
  run("cap-left-2", "data", 1, 0.03, [capInner("left", -4.0), hook(5.7, -4.0)]),
  run("cap-back-1", "power", 1, 0.03, [capInner("back", 5.0), hook(-5.0, 4.7)]),
  run("cap-back-2", "data", 1, 0.03, [capInner("back", -2.6), hook(2.6, 4.7)]),
  run("cap-back-3", "data", 1, 0.03, [capInner("back", 0.8), hook(0.3, 4.7)]),
];

/** A run's anchor as a world point. */
export function anchorPoint(anchor: WireAnchor): Vec3 {
  return "at" in anchor
    ? anchor.at
    : pointOnSide(anchor.side, anchor.alongM, anchor.y, anchor.outM);
}

/** Every strand of every run: spread ends, its own sag and thickness, seeded. */
export function wireStrands(
  runs: readonly WireRun[] = WIRE_RUNS,
): WireStrand[] {
  const rng = createRng(WIRES.seed);
  const strands: WireStrand[] = [];
  for (const r of runs) {
    const [tMin, tMax] = WIRES.thicknessM[r.kind];
    const [sMin, sMax] = WIRES.sagScale[r.kind];
    const j = WIRES.spreadM[r.kind];
    const jOut = Math.min(j, r.outSpreadM ?? WIRES.outSpreadM);
    for (let s = 0; s < r.strands; s += 1) {
      const thicknessM = rng.range(tMin, tMax);
      // On a wall the strands spread along it and up, but only a little out from it; a
      // port holds its bundle tight in its mouth; a saddle keeps them on the parapet.
      const ends = r.path.map((a): Vec3 => {
        const da = rng.range(-j, j);
        const dy = rng.range(-j, j);
        const dOut = rng.range(-jOut, jOut);
        // A window's end goes exactly into its opening; a loose end hangs a little to one
        // side or lower, but stays against the wall.
        if ("side" in a && a.end === "window")
          return pointOnSide(a.side, a.alongM, a.y, a.outM);
        if ("side" in a && a.end === "loose")
          return pointOnSide(a.side, a.alongM + da, a.y - Math.abs(dy), a.outM);
        if ("side" in a)
          return a.saddle
            ? pointOnSide(
                a.side,
                a.alongM + da,
                a.y + Math.abs(dy) * 0.2,
                a.outM,
              )
            : pointOnSide(a.side, a.alongM + da, a.y + dy, a.outM + dOut);
        // Ports and hooks hold their strands close.
        const k = 0.4 * jOut;
        return {
          x: a.at.x + (da / j) * k,
          y: a.at.y + (a.hold === "port" ? 0 : dy),
          z: a.at.z + (dOut / jOut) * k,
        };
      });
      const sagScale = rng.range(sMin, sMax);
      const points: Vec3[] = [];
      for (let i = 1; i < ends.length; i += 1) {
        const from = ends[i - 1];
        const to = ends[i];
        if (!from || !to) continue;
        const level = Math.hypot(to.x - from.x, to.z - from.z);
        const length = Math.hypot(level, to.y - from.y);
        const segments = Math.min(
          WIRES.maxSegments,
          Math.max(3, Math.ceil(length / WIRES.segmentM)),
        );
        const span = sagPoints(from, to, r.sag * level * sagScale, segments);
        points.push(...(i === 1 ? span : span.slice(1)));
      }
      strands.push({ run: r.id, kind: r.kind, thicknessM, points });
    }
  }
  return strands;
}

/** A bracket under each wall anchor, and a hook or saddle on the parapet. */
export function wireHardware(
  runs: readonly WireRun[] = WIRE_RUNS,
): DetailBox[] {
  const seen = new Set<string>();
  const boxes: DetailBox[] = [];
  const b = WIRES.bracketM;
  const metal = (box: DetailBox["box"]): DetailBox => ({
    kind: "metal",
    noStickers: true,
    box,
  });
  for (const r of runs)
    for (const a of r.path) {
      const key = JSON.stringify(a);
      if (seen.has(key)) continue;
      seen.add(key);
      // Loose ends and wires into windows aren't held.
      if ("side" in a && a.end) continue;
      if ("side" in a && a.saddle) {
        // A low half-saddle on the parapet's top, from its middle out to this lip.
        const outer = a.outM > 0;
        const from = outer ? -INNER / 2 : a.outM;
        const to = outer ? a.outM : -INNER / 2;
        boxes.push(
          metal(
            wallBox(
              a.side,
              a.alongM,
              PARAPET_Y,
              { across: 0.26, up: LIP_M / 2, out: to - from },
              from,
            ),
          ),
        );
      } else if ("side" in a)
        boxes.push(
          metal(
            wallBox(a.side, a.alongM, a.y - b / 2, {
              across: b,
              up: b,
              out: a.outM + 0.03,
            }),
          ),
        );
      else if (a.hold === "hook")
        boxes.push(
          metal({
            centre: { x: a.at.x, y: a.at.y + 0.02, z: a.at.z },
            size: { x: 0.16, y: 0.1, z: 0.16 },
          }),
        );
    }
  return boxes;
}

/** Each strand as thin square beams between its points. */
export function wireBeams(
  strands: readonly WireStrand[] = wireStrands(),
): DetailBeam[] {
  const beams: DetailBeam[] = [];
  for (const strand of strands)
    for (let i = 1; i < strand.points.length; i += 1) {
      const from = strand.points[i - 1];
      const to = strand.points[i];
      if (from && to)
        beams.push({ kind: "wire", from, to, thicknessM: strand.thicknessM });
    }
  return beams;
}

/** The layout with the wires added: hardware after its boxes, strands after its beams. */
export function withWires(layout: DetailLayout): DetailLayout {
  return {
    ...layout,
    boxes: [...layout.boxes, ...wireHardware()],
    beams: [...layout.beams, ...wireBeams()],
  };
}
