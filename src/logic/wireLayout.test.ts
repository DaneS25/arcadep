import { describe, expect, it } from "vitest";
import {
  BUILDING,
  SIDES,
  WINDOW,
  buildingHeightM,
  openingRect,
  pavementY,
  pointOnSide,
  rectContains,
  sideNormal,
  sideOffsetM,
  wallOpenings,
  type Box,
  type Side,
  type Vec3,
} from "./buildingLayout";
import { cabinetLayout } from "./cabinetLayout";
import { CAMERA, orbitPosition, posePosition } from "./cameraOrbit";
import { CLOSE_UP_SIDES, stopPose } from "./cameraStops";
import {
  detailLayout,
  roofTopY,
  withSignPlates,
  type DetailLayout,
} from "./detailLayout";
import { withDucts } from "./ductLayout";
import {
  generatorFootprint,
  generatorLayout,
  generatorPlugs,
  withGenerator,
} from "./generatorLayout";
import { MAX_POSTERS, graffitiLayout, posterKeepOut } from "./graffitiLayout";
import { BLOOM, DETAILS_LOOK, WIRE_LOOK } from "./lookConfig";
import { neonStrips } from "./neonLayout";
import { withSidewalk } from "./sidewalkLayout";
import { skillSignsLayout } from "./skillSignsLayout";
import { terminalLayout } from "./terminalLayout";
import { withWindows } from "./windowLayout";
import {
  INTO_WINDOW_OUT_M,
  LOOSE_OUT_M,
  WIRES,
  WIRE_RUNS,
  anchorPoint,
  wireBeams,
  wireHardware,
  wireStrands,
  withWires,
  type WireEnd,
  type WireStrand,
} from "./wireLayout";

const DEG = Math.PI / 180;
const PARAPET_Y = roofTopY() + BUILDING.parapetHeightM;
const HALF_W = BUILDING.widthM / 2;
const HALF_D = BUILDING.depthM / 2;

const strands = wireStrands();
const hardware = wireHardware();

/** Whether the segment from `a` to `b` passes through `box` grown by `margin` (slab test). */
function segmentHits(a: Vec3, b: Vec3, box: Box, margin = 0): boolean {
  let t0 = 0;
  let t1 = 1;
  for (const axis of ["x", "y", "z"] as const) {
    const d = b[axis] - a[axis];
    const lo = box.centre[axis] - box.size[axis] / 2 - margin;
    const hi = box.centre[axis] + box.size[axis] / 2 + margin;
    if (Math.abs(d) < 1e-12) {
      if (a[axis] < lo || a[axis] > hi) return false;
      continue;
    }
    let ta = (lo - a[axis]) / d;
    let tb = (hi - a[axis]) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** The shortest distance between segments p1-q1 and p2-q2. */
function segmentDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const c = dot(d1, r);
  const b = dot(d1, d2);
  const den = a * e - b * b;
  const clamp = (v: number): number => Math.min(1, Math.max(0, v));
  let s = den > 1e-12 ? clamp((b * f - c * e) / den) : 0;
  let t = e > 1e-12 ? (b * s + f) / e : 0;
  if (t < 0) {
    t = 0;
    s = clamp(-c / a);
  } else if (t > 1) {
    t = 1;
    s = clamp((b - c) / a);
  }
  const gap = sub(
    { x: p1.x + d1.x * s, y: p1.y + d1.y * s, z: p1.z + d1.z * s },
    { x: p2.x + d2.x * t, y: p2.y + d2.y * t, z: p2.z + d2.z * t },
  );
  return Math.hypot(gap.x, gap.y, gap.z);
}

/** A box round some points, grown by `margin`. */
function boundsOf(points: readonly Vec3[], margin: number): Box {
  const lo = { x: Infinity, y: Infinity, z: Infinity };
  const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of points)
    for (const axis of ["x", "y", "z"] as const) {
      lo[axis] = Math.min(lo[axis], p[axis]);
      hi[axis] = Math.max(hi[axis], p[axis]);
    }
  return {
    centre: {
      x: (lo.x + hi.x) / 2,
      y: (lo.y + hi.y) / 2,
      z: (lo.z + hi.z) / 2,
    },
    size: {
      x: hi.x - lo.x + 2 * margin,
      y: hi.y - lo.y + 2 * margin,
      z: hi.z - lo.z + 2 * margin,
    },
  };
}

/** Whether two boxes overlap, one grown by `margin`. */
function boxesOverlap(a: Box, b: Box, margin = 0): boolean {
  return (["x", "y", "z"] as const).every(
    (axis) =>
      Math.abs(a.centre[axis] - b.centre[axis]) <
      (a.size[axis] + b.size[axis]) / 2 + margin,
  );
}

/** A strand cut into short pieces, each with a box round it, so a test can skip most quickly. */
type Piece = {
  readonly run: string;
  readonly radius: number;
  readonly first: boolean;
  readonly points: readonly Vec3[];
  readonly bounds: Box;
};
function pieces(list: readonly WireStrand[], margin: number): Piece[] {
  const out: Piece[] = [];
  for (const s of list)
    for (let i = 0; i < s.points.length - 1; i += 4) {
      const points = s.points.slice(i, i + 5);
      out.push({
        run: s.run,
        radius: s.thicknessM / 2,
        first: i === 0,
        points,
        bounds: boundsOf(points, s.thicknessM / 2 + margin),
      });
    }
  return out;
}

/** Whether a piece of wire (its radius plus `margin`) touches `box`. */
function pieceHitsBox(piece: Piece, box: Box, margin = 0): boolean {
  if (!boxesOverlap(piece.bounds, box, margin)) return false;
  for (let i = 1; i < piece.points.length; i += 1) {
    const a = piece.points[i - 1];
    const b = piece.points[i];
    if (a && b && segmentHits(a, b, box, piece.radius + margin)) return true;
  }
  return false;
}

/** The building's walls and roof, a hair inside its faces, so props on them aren't hidden. */
const BUILDING_SOLID: Box = {
  centre: { x: 0, y: buildingHeightM() / 2, z: 0 },
  size: {
    x: BUILDING.widthM - 0.02,
    y: buildingHeightM(),
    z: BUILDING.depthM - 0.02,
  },
};

describe("WIRE_RUNS", () => {
  it("hangs every run from the building: walls, parapet or the generator's ports", () => {
    const plugs = generatorPlugs().map((p) => p.position);
    for (const run of WIRE_RUNS) {
      expect(run.path.length, run.id).toBeGreaterThanOrEqual(2);
      for (const a of run.path) {
        if ("side" in a) {
          const half =
            a.side === "front" || a.side === "back" ? HALF_W : HALF_D;
          expect(Math.abs(a.alongM), run.id).toBeLessThan(half);
          if (a.end) {
            // Free ends come last, and the tests below check where they rest.
            expect(a, run.id).toBe(run.path.at(-1));
          } else if (a.saddle) {
            // Just over the parapet's top, at its outer or inner edge.
            expect(a.y, run.id).toBeGreaterThan(PARAPET_Y);
            expect(a.y, run.id).toBeLessThan(PARAPET_Y + 0.1);
            expect(a.outM, run.id).toBeGreaterThan(
              -BUILDING.parapetThicknessM - 0.1,
            );
            expect(a.outM, run.id).toBeLessThan(0.2);
          } else {
            expect(a.y, run.id).toBeGreaterThan(pavementY() + 3);
            expect(a.y, run.id).toBeLessThan(PARAPET_Y);
            expect(a.outM, run.id).toBeGreaterThan(0.1);
            expect(a.outM, run.id).toBeLessThanOrEqual(0.45);
          }
        } else if (a.hold === "port") {
          expect(plugs).toContainEqual(a.at);
        } else {
          // Hooks on the parapet's inner face, down in the roof's well.
          expect(a.at.y).toBeGreaterThan(roofTopY());
          expect(a.at.y).toBeLessThan(PARAPET_Y);
          expect(Math.abs(a.at.x)).toBeLessThan(
            HALF_W - BUILDING.parapetThicknessM,
          );
          expect(Math.abs(a.at.z)).toBeLessThan(
            HALF_D - BUILDING.parapetThicknessM,
          );
        }
      }
    }
  });

  it("holds every wall, hook and saddle anchor with its own bracket", () => {
    for (const run of WIRE_RUNS)
      for (const a of run.path) {
        if ("hold" in a && a.hold === "port") continue;
        // Loose ends and wires into windows aren't held.
        if ("side" in a && a.end) continue;
        const p = anchorPoint(a);
        const held = hardware.some(({ box }) =>
          (["x", "y", "z"] as const).every(
            (axis) =>
              Math.abs(p[axis] - box.centre[axis]) <= box.size[axis] / 2 + 0.06,
          ),
        );
        expect(held, `${run.id} ${JSON.stringify(p)}`).toBe(true);
      }
  });

  it("runs one cable out of each of the generator's ports, up and away", () => {
    const plugs = generatorPlugs();
    const feeds = WIRE_RUNS.filter((r) => r.id.startsWith("feed-"));
    expect(feeds).toHaveLength(plugs.length);
    for (const [i, plug] of plugs.entries()) {
      const feed = feeds[i];
      const first = feed?.path[0];
      expect(first && "hold" in first && first.hold).toBe("port");
      expect(first && "at" in first && first.at).toEqual(plug.position);
      // Up out of the port, then along the wall and round the corner: a long run.
      const next = feed?.path[1];
      expect(next && anchorPoint(next).y).toBeGreaterThan(plug.position.y + 1);
      expect(feed?.path.length).toBeGreaterThanOrEqual(6);
      // A few cables, not heavy bundles (user, 2026-10-16).
      expect(feed?.kind).not.toBe("bundle");
      expect(feed?.strands).toBe(1);
    }
  });

  it("is thin and stringy: every strand thinner than round 1's power cables, bundles few and small", () => {
    // Bundled strands are a touch fatter than the power cables, which are fatter than data lines.
    expect(WIRES.thicknessM.bundle[0]).toBeGreaterThan(
      WIRES.thicknessM.power[1],
    );
    expect(WIRES.thicknessM.power[0]).toBeGreaterThan(WIRES.thicknessM.data[1]);
    for (const s of strands) expect(s.thicknessM, s.run).toBeLessThan(0.033);
    const bundles = WIRE_RUNS.filter((r) => r.kind === "bundle");
    expect(bundles.length).toBeLessThanOrEqual(3);
    for (const r of bundles) expect(r.strands, r.id).toBeLessThanOrEqual(3);
    // Mostly single cables.
    const singles = WIRE_RUNS.filter((r) => r.strands === 1).length;
    expect(singles / WIRE_RUNS.length).toBeGreaterThan(0.9);
  });

  it("is sparse but all round: wires on the front, right and left walls and the roof", () => {
    // Round 2's 242 strands read as a bunched mass; the user asked for roughly 60 to 80.
    expect(strands.length).toBeGreaterThanOrEqual(60);
    expect(strands.length).toBeLessThanOrEqual(80);
    const count = (pred: (p: Vec3) => boolean): number =>
      strands.filter((s) => s.points.some(pred)).length;
    const nearWall = (side: Side) => (p: Vec3) => {
      const n = pointOnSide(side, 0, 0, 1);
      const out =
        (p.x * n.x + p.z * n.z) / Math.hypot(n.x, n.z) - sideOffsetM(side);
      return out > 0 && out < 0.7 && p.y < roofTopY();
    };
    expect(count(nearWall("front"))).toBeGreaterThan(25);
    expect(count(nearWall("right"))).toBeGreaterThan(15);
    expect(count(nearWall("left"))).toBeGreaterThan(10);
    expect(
      count(
        (p) =>
          Math.abs(p.x) < HALF_W && Math.abs(p.z) < HALF_D && p.y > roofTopY(),
      ),
    ).toBeGreaterThan(12);
  });

  /** The runs that end free, of one kind, with their end and the anchor before it. */
  const freeEnds = (kind: WireEnd) =>
    WIRE_RUNS.flatMap((run) => {
      const end = run.path.at(-1);
      const before = run.path.at(-2);
      return end && before && "side" in end && end.end === kind
        ? [{ run, end, before: anchorPoint(before) }]
        : [];
    });

  it("lets a few loose ends dangle down the walls, resting against them", () => {
    const ends = freeEnds("loose");
    expect(ends.length).toBeGreaterThanOrEqual(3);
    expect(ends.length).toBeLessThanOrEqual(8);
    expect(new Set(ends.map(({ end }) => end.side)).size).toBeGreaterThan(1);
    for (const { run, end, before } of ends) {
      // Hanging down from its last bracket, a short way to one side at most.
      expect(before.y - end.y, run.id).toBeGreaterThan(0.6);
      const p = anchorPoint(end);
      expect(Math.hypot(p.x - before.x, p.z - before.z), run.id).toBeLessThan(
        0.5,
      );
      // Against the wall, so it ends on the building, never in the air past it.
      expect(end.outM, run.id).toBe(LOOSE_OUT_M);
      expect(end.y, run.id).toBeGreaterThan(pavementY() + 2.85);
      // Not over a window or door.
      for (const o of wallOpenings().filter((o) => o.side === end.side)) {
        const r = openingRect(o);
        const over =
          end.alongM > r.minAlong - 0.1 &&
          end.alongM < r.maxAlong + 0.1 &&
          end.y < r.maxY + 0.1;
        expect(over && end.y > r.minY - 0.1, run.id).toBe(false);
      }
    }
    // Each strand's end stays against the wall, below its bracket.
    for (const { run, end, before } of ends)
      for (const s of strands.filter((s) => s.run === run.id)) {
        const last = s.points.at(-1);
        if (!last) throw new Error("empty strand");
        const n = sideNormal(end.side);
        const out = last.x * n.x + last.z * n.z - sideOffsetM(end.side);
        expect(out, run.id).toBeCloseTo(LOOSE_OUT_M, 6);
        expect(last.y, run.id).toBeLessThan(before.y - 0.5);
      }
  });

  it("runs a handful of wires into windows, ending at a pane inside the frame", () => {
    const ends = freeEnds("window");
    expect(ends.length).toBeGreaterThanOrEqual(2);
    expect(ends.length).toBeLessThanOrEqual(6);
    for (const { run, end, before } of ends) {
      // Into an open window (not a boarded one, nor a door), inside its frame's border.
      const window = wallOpenings().find((o) => {
        if (o.side !== end.side || o.kind !== "window") return false;
        const r = openingRect(o);
        return (
          end.alongM > r.minAlong + WINDOW.frameM &&
          end.alongM < r.maxAlong - WINDOW.frameM &&
          end.y > r.minY + WINDOW.frameM &&
          end.y < r.maxY - WINDOW.frameM
        );
      });
      expect(window, run.id).toBeDefined();
      expect(window?.look, run.id).not.toBe("boarded");
      // Just off the pane, so it reads as going in, never in the air past the wall.
      expect(end.outM, run.id).toBe(INTO_WINDOW_OUT_M);
      expect(end.outM).toBeGreaterThan(WINDOW.frameDepthM);
      expect(end.outM).toBeLessThan(WINDOW.frameDepthM + 0.05);
      // Down into it from a bracket above.
      expect(before.y, run.id).toBeGreaterThan(end.y);
      for (const s of strands.filter((s) => s.run === run.id))
        expect(s.points.at(-1), run.id).toEqual(anchorPoint(end));
    }
  });
});

describe("wireStrands", () => {
  it("is the same on every load", () => {
    expect(wireStrands()).toEqual(strands);
  });

  it("starts and ends every strand at one of its run's anchors: nothing trails off", () => {
    for (const run of WIRE_RUNS) {
      const own = strands.filter((s) => s.run === run.id);
      expect(own).toHaveLength(run.strands);
      const ends = [run.path[0], run.path.at(-1)].map((a) =>
        a ? anchorPoint(a) : { x: NaN, y: NaN, z: NaN },
      );
      for (const s of own) {
        const [a, b] = [s.points[0], s.points.at(-1)];
        for (const [p, end] of [
          [a, ends[0]],
          [b, ends[1]],
        ] as const) {
          if (!p || !end) throw new Error("empty strand");
          expect(
            Math.hypot(p.x - end.x, p.y - end.y, p.z - end.z),
            run.id,
          ).toBeLessThan(0.2);
        }
      }
    }
  });

  it("stays on the building: never inside it, never far out from its walls, never in the street", () => {
    for (const s of strands)
      for (const p of s.points) {
        // Within 0.7 m of the walls (or over the generator, where the feeds plug in), over
        // the pavement, never higher than the saddles on the parapet's top (no masts: the
        // rooftop sign stays clear).
        const onGenerator = rectContains(generatorFootprint(), p.x, p.z);
        expect(Math.abs(p.x) < HALF_W + 0.7 || onGenerator, s.run).toBe(true);
        expect(Math.abs(p.z) < HALF_D + 0.7 || onGenerator, s.run).toBe(true);
        // Over the heads of the ground floor's windows and doors.
        expect(p.y, s.run).toBeGreaterThan(pavementY() + 2.85);
        expect(p.y, s.run).toBeLessThan(PARAPET_Y + 0.15);
        // Not inside the walls or the parapet: either outside the footprint, over the
        // parapet, or down in the roof's well.
        const r = s.thicknessM / 2;
        const outside =
          Math.abs(p.x) > HALF_W + r ||
          Math.abs(p.z) > HALF_D + r ||
          p.y > PARAPET_Y + r;
        const inWell =
          Math.abs(p.x) < HALF_W - BUILDING.parapetThicknessM - r &&
          Math.abs(p.z) < HALF_D - BUILDING.parapetThicknessM - r &&
          p.y > roofTopY() + r;
        expect(outside || inWell, `${s.run} ${JSON.stringify(p)}`).toBe(true);
      }
  });

  it("stays out of reach of the orbiting camera", () => {
    for (const s of strands)
      for (const p of s.points)
        expect(
          Math.hypot(
            p.x - CAMERA.target.x,
            p.y - CAMERA.target.y,
            p.z - CAMERA.target.z,
          ),
        ).toBeLessThan(CAMERA.minDistanceM - 1);
  });

  it("passes through no prop: windows, ducts, pipes, signs, tubes, the generator, cabinet or terminal", () => {
    const props: { tag: string; box: Box }[] = [
      ...withWindows(
        withSidewalk(withGenerator(withDucts(detailLayout()))),
      ).boxes.map((part) => ({ tag: part.kind, box: part.box })),
      ...neonStrips().map((strip) => ({ tag: strip.name, box: strip.box })),
      ...skillSignsLayout(12).signs.map((sign) => ({
        tag: "skill sign",
        box: sign.plate,
      })),
      ...cabinetLayout().parts.map((box) => ({ tag: "cabinet", box })),
      ...terminalLayout().parts.map((box) => ({ tag: "terminal", box })),
    ];
    // A feed's first stretch leaves its own port's collar and mouth.
    const ports = generatorLayout().boxes.filter(({ box }) =>
      generatorPlugs().some(
        (p) =>
          Math.abs(box.centre.x - p.position.x) < 1e-9 &&
          Math.abs(box.centre.z - p.position.z) < 1e-9,
      ),
    );
    const hits: string[] = [];
    for (const piece of pieces(strands, 0))
      for (const { tag, box } of props) {
        if (
          piece.first &&
          piece.run.startsWith("feed-") &&
          ports.some((p) => JSON.stringify(p.box) === JSON.stringify(box))
        )
          continue;
        if (pieceHitsBox(piece, box)) hits.push(`${piece.run} x ${tag}`);
      }
    // Nor do their brackets, hooks and saddles.
    for (const { box } of hardware)
      for (const { tag, box: other } of props)
        if (boxesOverlap(box, other, -1e-6))
          hits.push(`bracket ${JSON.stringify(box.centre)} x ${tag}`);
    expect(hits).toEqual([]);
  }, 20_000);
});

describe("the wires in every view", () => {
  /** Points on a quad (its middle and corners pulled in a little), just off its face. */
  const quadPoints = (q: { corners: readonly Vec3[]; normal: Vec3 }) => {
    const n = q.corners.length;
    const mid = q.corners.reduce(
      (m, c) => ({ x: m.x + c.x / n, y: m.y + c.y / n, z: m.z + c.z / n }),
      { x: 0, y: 0, z: 0 },
    );
    const off = (p: Vec3): Vec3 => ({
      x: p.x + q.normal.x * 0.02,
      y: p.y + q.normal.y * 0.02,
      z: p.z + q.normal.z * 0.02,
    });
    return [
      mid,
      ...q.corners.map((c) => ({
        x: mid.x + (c.x - mid.x) * 0.9,
        y: mid.y + (c.y - mid.y) * 0.9,
        z: mid.z + (c.z - mid.z) * 0.9,
      })),
    ].map((p) => ({ point: off(p), normal: q.normal }));
  };
  /** Everything the visitor clicks: the cabinet, the terminal, the skill signs, the posters. */
  const CLICKABLE = [
    ...cabinetLayout().faces.flatMap(quadPoints),
    ...terminalLayout().faces.flatMap(quadPoints),
    ...skillSignsLayout(12).signs.flatMap((s) => quadPoints(s.quad)),
    ...graffitiLayout(MAX_POSTERS, 1).posters.flatMap((p) =>
      quadPoints(p.quad),
    ),
  ];
  /** The shop signs and the rooftop name. */
  const SIGNS = detailLayout().faces.flatMap((f) => quadPoints(f.quad));

  const STOPS: Vec3[] = [
    ...SIDES.map((side) => posePosition(stopPose({ kind: "side", side }))),
    ...CLOSE_UP_SIDES.map((side) =>
      posePosition(stopPose({ kind: "closeUp", side })),
    ),
    orbitPosition(CAMERA.start),
  ];
  const ORBITS: Vec3[] = [];
  for (let az = 0; az < 360; az += 10)
    for (const polarRad of [
      CAMERA.minPolarRad,
      45 * DEG,
      CAMERA.sidePolarRad,
      72 * DEG,
      CAMERA.maxPolarRad,
    ])
      for (const distanceM of [
        CAMERA.minDistanceM,
        20,
        CAMERA.sideDistanceM,
        CAMERA.maxDistanceM,
      ])
        ORBITS.push(
          orbitPosition({ azimuthRad: az * DEG, polarRad, distanceM }),
        );

  /** The wires, their brackets, and the cables the detail pass still hangs. */
  const MARGIN = 0.05;
  const WIRE_PIECES = pieces(
    [
      ...strands,
      ...detailLayout()
        .beams.filter((b) => b.kind === "cable")
        .map((b, i) => ({
          run: `detail-cable-${String(i)}`,
          kind: "power" as const,
          thicknessM: b.thicknessM,
          points: [b.from, b.to],
        })),
    ],
    MARGIN,
  );

  /** Sight lines from `cameras` to `targets` the building leaves open, and how many a wire cuts. */
  function sightLines(
    cameras: readonly Vec3[],
    targets: readonly { point: Vec3; normal: Vec3 }[],
  ): { checked: number; blocked: string[] } {
    let checked = 0;
    const blocked: string[] = [];
    for (const camera of cameras)
      for (const { point, normal } of targets) {
        // Only faces turned towards the camera, on lines the building doesn't already cut.
        if (dot(sub(camera, point), normal) <= 0) continue;
        if (segmentHits(camera, point, BUILDING_SOLID)) continue;
        checked += 1;
        for (const { box } of hardware)
          if (segmentHits(camera, point, box, MARGIN))
            blocked.push(`bracket ${JSON.stringify(box.centre)}`);
        for (const piece of WIRE_PIECES) {
          if (!segmentHits(camera, point, piece.bounds)) continue;
          for (let i = 1; i < piece.points.length; i += 1) {
            const a = piece.points[i - 1];
            const b = piece.points[i];
            if (
              a &&
              b &&
              segmentDistance(camera, point, a, b) < piece.radius + MARGIN
            ) {
              blocked.push(`${piece.run} -> ${JSON.stringify(point)}`);
              break;
            }
          }
        }
      }
    return { checked, blocked };
  }

  it("hides no clickable item from any camera stop, close-up or sampled orbit", () => {
    const { checked, blocked } = sightLines([...STOPS, ...ORBITS], CLICKABLE);
    expect(checked).toBeGreaterThan(10000);
    expect(blocked.slice(0, 5)).toEqual([]);
  }, 30_000);

  it("hides no sign from any camera stop, close-up or the opening view", () => {
    const { checked, blocked } = sightLines(STOPS, SIGNS);
    expect(checked).toBeGreaterThan(20);
    expect(blocked.slice(0, 5)).toEqual([]);
  });

  it("never crosses a sign face, a poster, the cabinet's screen or the terminal", () => {
    /** The space in front of a quad, 1.5 m deep. */
    const front = (q: { corners: readonly Vec3[]; normal: Vec3 }): Box => {
      const far = q.corners.map((c) => ({
        x: c.x + q.normal.x * 1.5,
        y: c.y + q.normal.y * 1.5,
        z: c.z + q.normal.z * 1.5,
      }));
      return boundsOf([...q.corners, ...far], 0);
    };
    const keepOut: Box[] = [
      ...detailLayout().faces.map((f) => front(f.quad)),
      ...cabinetLayout().faces.map(front),
      ...terminalLayout().faces.map(front),
      ...skillSignsLayout(12).signs.map((s) => front(s.quad)),
      ...posterKeepOut().map((r) =>
        boundsOf(
          [
            pointOnSide(r.side, r.minAlong, r.minY, 0),
            pointOnSide(r.side, r.maxAlong, r.maxY, 1.5),
          ],
          0,
        ),
      ),
    ];
    for (const piece of pieces(strands, 0))
      for (const box of keepOut)
        expect(pieceHitsBox(piece, box), piece.run).toBe(false);
    for (const { box } of hardware)
      for (const k of keepOut) expect(boxesOverlap(box, k)).toBe(false);
  });
});

describe("withWires", () => {
  it("adds the brackets after the layout's boxes and the strands after its beams", () => {
    const base: DetailLayout = withGenerator(withDucts(detailLayout()));
    const wired = withWires(base);
    expect(wired.boxes.slice(0, base.boxes.length)).toEqual(base.boxes);
    expect(wired.boxes.slice(base.boxes.length)).toEqual(hardware);
    expect(wired.beams.slice(0, base.beams.length)).toEqual(base.beams);
    expect(wired.beams.slice(base.beams.length)).toEqual(wireBeams());
    expect(wired.faces).toEqual(base.faces);
    // One beam per strand segment, all of the wire kind.
    const segments = strands.reduce((n, s) => n + s.points.length - 1, 0);
    expect(wireBeams()).toHaveLength(segments);
    for (const beam of wireBeams()) expect(beam.kind).toBe("wire");
    // The sign plates still go last.
    const plated = withSignPlates(
      wired,
      skillSignsLayout(12).signs.map((s) => s.plate),
    );
    expect(plated.boxes.at(-1)?.kind).toBe("signPlate");
  });

  it("keeps the strands cheap: a vertex budget headless (software) WebGL can draw", () => {
    // Round 1's 6,547 beams (107k vertices) made the slow smoke tests take about half as long
    // again; round 2's 2,350 (40k) still cost a third of the headless frame rate.
    expect(wireBeams().length * 16).toBeLessThan(15_000);
  });

  it("shades the wires a pale grey with a faint sheen that never blooms, and keeps stickers off", () => {
    const shades = DETAILS_LOOK.shades;
    // Lighter than the metal, so they catch the neon against the dark walls (round 2).
    expect(shades.wire).toBeGreaterThan(shades.metal);
    expect(shades.wire).toBeLessThan(2);
    // The sheen glows through the atlas at the details' strength: far under the bloom.
    const hex = WIRE_LOOK.sheen.slice(1);
    for (let i = 0; i < 3; i += 1) {
      const c = parseInt(hex.slice(i * 2, i * 2 + 2), 16) / 255;
      expect(c * DETAILS_LOOK.emissiveIntensity).toBeLessThan(
        BLOOM.threshold / 3,
      );
    }
    for (const part of hardware) expect(part.noStickers).toBe(true);
  });
});
