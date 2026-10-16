import { describe, expect, it } from "vitest";
import type { AppMode } from "./appState";
import {
  BUILDING,
  SIDES,
  STREET,
  buildingHeightM,
  type Box,
  type Side,
  type Vec3,
} from "./buildingLayout";
import { screenViewPose } from "./cabinetLayout";
import { detailLayout } from "./detailLayout";
import { withDucts } from "./ductLayout";
import { withGenerator } from "./generatorLayout";
import { neonStrips } from "./neonLayout";
import {
  CAMERA,
  planPoseTween,
  posePosition,
  samplePoseTween,
  sidePose,
  type CameraPose,
} from "./cameraOrbit";
import {
  CLOSE_UP_SIDES,
  cameraCue,
  closeUpSide,
  stopPose,
} from "./cameraStops";
import { MAX_POSTERS, graffitiLayout, postersViewPose } from "./graffitiLayout";
import { skillSignsLayout, signsViewPose } from "./skillSignsLayout";

const EXPLORING: AppMode = { kind: "exploring" };
const focused = (side: Side): AppMode => ({ kind: "focused", side });
const panel = (side: Side): AppMode => ({ kind: "panel", side });

function inside(box: Box, p: Vec3, margin = 0): boolean {
  return (
    Math.abs(p.x - box.centre.x) < box.size.x / 2 + margin &&
    Math.abs(p.y - box.centre.y) < box.size.y / 2 + margin &&
    Math.abs(p.z - box.centre.z) < box.size.z / 2 + margin
  );
}

/** The building with everything on its roof (the name sign stands over the parapet). */
const BUILDING_BOX: Box = {
  centre: { x: 0, y: (buildingHeightM() + 2.5) / 2, z: 0 },
  size: {
    x: BUILDING.widthM,
    y: buildingHeightM() + 2.5,
    z: BUILDING.depthM,
  },
};

/** Everything fixed on or round the building: props, ducts, the lamp, the generator, cables' brackets and the neon. */
const PROPS: readonly Box[] = [
  ...withGenerator(withDucts(detailLayout())).boxes.map(({ box }) => box),
  ...neonStrips().map(({ box }) => box),
];

const DEG = Math.PI / 180;
/** Where a move can start: each side's view, plus free-look orbits at the zoom limits. */
const STARTS: readonly CameraPose[] = [
  ...SIDES.map((side) => sidePose(side)),
  ...[0, 45, 135, 200, 300].flatMap((azimuthDeg) =>
    [CAMERA.minDistanceM, CAMERA.maxDistanceM].map((distanceM) => ({
      target: CAMERA.target,
      orbit: {
        azimuthRad: azimuthDeg * DEG,
        polarRad: CAMERA.maxPolarRad,
        distanceM,
      },
    })),
  ),
];

/** Every sampled camera position on the way from `from` to `to`. */
function path(from: CameraPose, to: CameraPose): Vec3[] {
  const tween = planPoseTween(from, to, false);
  const points: Vec3[] = [];
  for (let ms = 0; ms <= CAMERA.tweenMs; ms += 5)
    points.push(posePosition(samplePoseTween(tween, ms).pose));
  return points;
}

describe("stopPose", () => {
  it("is the side view for a side, and each close-up side's own view", () => {
    expect(stopPose({ kind: "side", side: "left" })).toEqual(sidePose("left"));
    expect(stopPose({ kind: "closeUp", side: "front" })).toEqual(
      screenViewPose(),
    );
    expect(stopPose({ kind: "closeUp", side: "left" })).toEqual(
      signsViewPose(),
    );
    expect(stopPose({ kind: "closeUp", side: "back" })).toEqual(
      postersViewPose(),
    );
  });

  it("has no close-up for the right side, whose terminal jacks in instead", () => {
    expect(CLOSE_UP_SIDES).not.toContain("right");
    expect(stopPose({ kind: "closeUp", side: "right" })).toEqual(
      sidePose("right"),
    );
  });
});

describe("closeUpSide", () => {
  it("is the front, left or back only while its panel is open", () => {
    expect(closeUpSide(panel("front"))).toBe("front");
    expect(closeUpSide(panel("left"))).toBe("left");
    expect(closeUpSide(panel("back"))).toBe("back");
    expect(closeUpSide(panel("right"))).toBeUndefined();
    expect(closeUpSide(focused("front"))).toBeUndefined();
    expect(closeUpSide(EXPLORING)).toBeUndefined();
  });
});

describe("the signs' close-up", () => {
  const pose = signsViewPose();
  const camera = posePosition(pose);
  const layout = skillSignsLayout(12);

  it("looks at the cluster straight on from the street, at about its height", () => {
    expect(camera.x).toBeLessThan(-BUILDING.widthM / 2 - STREET.sidewalkWidthM);
    expect(Math.abs(camera.z - pose.target.z)).toBeLessThan(1e-9);
    expect(Math.abs(camera.y - pose.target.y)).toBeLessThan(1);
  });

  it("frames the whole cluster centred behind the centred panel, much larger than the side view", () => {
    const halfTan = Math.tan(25 * DEG);
    const distance = Math.abs(camera.x - pose.target.x);
    // Horizontal screen position from -1 (left edge) to 1 on a 16:9 window. The left wall
    // faces -x, so the visitor's right is +z.
    const ndc = (z: number): number =>
      (z - pose.target.z) / (distance * halfTan * (16 / 9));
    const zs = layout.signs.flatMap((s) => s.quad.corners.map((c) => c.z));
    const ys = layout.signs.flatMap((s) => s.quad.corners.map((c) => c.y));
    expect(ndc(Math.min(...zs))).toBeGreaterThan(-1);
    expect(ndc(Math.max(...zs))).toBeLessThan(1);
    // Every panel opens centred (task 18), so the cluster is centred behind it.
    expect(
      Math.abs((ndc(Math.min(...zs)) + ndc(Math.max(...zs))) / 2),
    ).toBeLessThan(0.15);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(
      2 * distance * halfTan,
    );
    expect(distance).toBeLessThan(CAMERA.sideDistanceM / 3);
  });
});

describe("the posters' close-up", () => {
  const pose = postersViewPose();
  const camera = posePosition(pose);

  it("stands back past the alley's kerb and sees every poster with nothing in the way", () => {
    // Task 27: the posters spread over three floors, so the camera stands further back,
    // about level with the first floor, but still well inside the side view's distance.
    expect(camera.z).toBeLessThan(-BUILDING.depthM / 2 - STREET.alleyWidthM);
    expect(camera.z).toBeGreaterThan(-BUILDING.depthM / 2 - 16);
    expect(camera.y).toBeGreaterThan(STREET.curbHeightM + 3);
    expect(camera.y).toBeLessThan(10);
    // A sight line to the middle and every corner of each poster misses every prop and tube
    // (task 26: the poles are gone), up to the paint just off the wall.
    const layout = graffitiLayout(MAX_POSTERS, 1);
    const targets = layout.posters.flatMap((p) => {
      const cs = p.quad.corners;
      const mid = cs.reduce(
        (m, c) => ({
          x: m.x + c.x / cs.length,
          y: m.y + c.y / cs.length,
          z: m.z + c.z / cs.length,
        }),
        { x: 0, y: 0, z: 0 },
      );
      return [mid, ...cs];
    });
    for (const corner of targets) {
      for (let t = 0.02; t < 1; t += 0.02) {
        const p = {
          x: camera.x + (corner.x - camera.x) * t,
          y: camera.y + (corner.y - camera.y) * t,
          z: camera.z + (corner.z - camera.z) * t,
        };
        if (p.z < -BUILDING.depthM / 2 - 0.1)
          for (const box of PROPS) expect(inside(box, p, 0.02)).toBe(false);
      }
    }
  });

  /** Where a world point lands on a 16:9 window, from -1 to 1 each way (the app's 50° camera). */
  const halfTan = Math.tan(25 * DEG);
  const forward = (() => {
    const d = {
      x: pose.target.x - camera.x,
      y: pose.target.y - camera.y,
      z: pose.target.z - camera.z,
    };
    const l = Math.hypot(d.x, d.y, d.z);
    return { x: d.x / l, y: d.y / l, z: d.z / l };
  })();
  // The back wall faces -z, so the visitor's right is -x; up is square to both.
  const right = { x: -1, y: 0, z: 0 };
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  const project = (p: Vec3): { x: number; y: number } => {
    const d = { x: p.x - camera.x, y: p.y - camera.y, z: p.z - camera.z };
    const depth = d.x * forward.x + d.y * forward.y + d.z * forward.z;
    return {
      x:
        (d.x * right.x + d.y * right.y + d.z * right.z) /
        depth /
        (halfTan * (16 / 9)),
      y: (d.x * up.x + d.y * up.y + d.z * up.z) / depth / halfTan,
    };
  };

  for (const count of [3, MAX_POSTERS])
    it(`frames all ${String(count)} posters centred behind the centred panel on a 16:9 window`, () => {
      const layout = graffitiLayout(count, 1);
      const pts = layout.posters.flatMap((p) => p.quad.corners.map(project));
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      // Every poster is in view across three floors, and the spread is centred behind the
      // centred panel (task 18).
      for (const p of pts) {
        expect(Math.abs(p.x)).toBeLessThan(0.95);
        expect(Math.abs(p.y)).toBeLessThan(0.95);
      }
      expect(Math.abs((Math.max(...xs) + Math.min(...xs)) / 2)).toBeLessThan(
        0.15,
      );
      expect(Math.abs((Math.max(...ys) + Math.min(...ys)) / 2)).toBeLessThan(
        0.15,
      );
    });

  it("shows every poster at least an eighth of the window high, so it reads", () => {
    for (const poster of graffitiLayout(MAX_POSTERS, 1).posters) {
      const ys = poster.quad.corners.map((c) => project(c).y);
      expect((Math.max(...ys) - Math.min(...ys)) / 2).toBeGreaterThan(1 / 8);
    }
  });
});

describe("moves to and from the signs and posters", () => {
  it("never pass through the building, its roof, its props or the pavement", () => {
    for (const side of ["left", "back"] as const) {
      const closeUp = stopPose({ kind: "closeUp", side });
      for (const start of STARTS)
        for (const [from, to] of [
          [start, closeUp],
          [closeUp, start],
        ] as const)
          for (const p of path(from, to)) {
            expect(inside(BUILDING_BOX, p, 0.3)).toBe(false);
            for (const box of PROPS) expect(inside(box, p, 0.15)).toBe(false);
            expect(p.y).toBeGreaterThan(STREET.curbHeightM + 0.5);
          }
    }
  }, 20_000);
});

describe("cameraCue", () => {
  it("moves in to the screen when the front panel opens, by key or click", () => {
    expect(cameraCue(focused("front"), panel("front"), undefined)).toEqual({
      kind: "closeUp",
      side: "front",
    });
    expect(cameraCue(EXPLORING, panel("front"), "front")).toEqual({
      kind: "closeUp",
      side: "front",
    });
  });

  it("backs out to the front view when the front panel closes", () => {
    expect(cameraCue(panel("front"), focused("front"), undefined)).toEqual({
      kind: "side",
      side: "front",
    });
    expect(cameraCue(panel("front"), EXPLORING, undefined)).toEqual({
      kind: "side",
      side: "front",
    });
  });

  it("stays put while the front panel stays open", () => {
    expect(
      cameraCue(panel("front"), panel("front"), undefined),
    ).toBeUndefined();
  });

  it("moves in to the signs and the posters when their panels open, and back out", () => {
    for (const side of ["left", "back"] as const) {
      expect(cameraCue(focused(side), panel(side), undefined)).toEqual({
        kind: "closeUp",
        side,
      });
      expect(cameraCue(EXPLORING, panel(side), side)).toEqual({
        kind: "closeUp",
        side,
      });
      expect(cameraCue(panel(side), focused(side), undefined)).toEqual({
        kind: "side",
        side,
      });
    }
  });

  it("passes other snaps straight through, and leaves the right side's panel on its view", () => {
    expect(cameraCue(EXPLORING, focused("left"), "left")).toEqual({
      kind: "side",
      side: "left",
    });
    expect(
      cameraCue(focused("right"), panel("right"), undefined),
    ).toBeUndefined();
    expect(cameraCue(EXPLORING, panel("right"), "right")).toEqual({
      kind: "side",
      side: "right",
    });
  });
});
