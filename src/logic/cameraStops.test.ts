import { describe, expect, it } from "vitest";
import type { AppMode } from "./appState";
import {
  BUILDING,
  SIDES,
  STREET,
  alleyWallBox,
  buildingHeightM,
  type Box,
  type Side,
  type Vec3,
} from "./buildingLayout";
import { screenViewPose } from "./cabinetLayout";
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
import { graffitiLayout, postersViewPose } from "./graffitiLayout";
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
  const alley = alleyWallBox();

  it("hangs over the alley, above the alley wall, and looks down at the posters", () => {
    const alleyFace = alley.centre.z + alley.size.z / 2;
    expect(camera.z).toBeGreaterThan(alleyFace);
    expect(camera.z).toBeLessThan(-BUILDING.depthM / 2 - 2);
    expect(camera.y).toBeGreaterThan(STREET.alleyWallHeightM + 1);
    expect(camera.y).toBeLessThan(STREET.alleyWallHeightM + 3);
  });

  it("frames a three-poster row centred behind the centred panel on a 16:9 window", () => {
    const layout = graffitiLayout(3, 1);
    const distance = Math.hypot(
      camera.z - pose.target.z,
      camera.y - pose.target.y,
    );
    // The back wall faces -z, so the visitor's right is -x.
    const ndc = (x: number): number =>
      -(x - pose.target.x) / (distance * Math.tan(25 * DEG) * (16 / 9));
    // The whole row is in view and centred, behind the centred panel (task 18).
    const xs = layout.posters.flatMap((p) => p.quad.corners.map((c) => c.x));
    expect(ndc(Math.max(...xs))).toBeGreaterThan(-1);
    expect(ndc(Math.min(...xs))).toBeLessThan(1);
    expect(
      Math.abs((ndc(Math.max(...xs)) + ndc(Math.min(...xs))) / 2),
    ).toBeLessThan(0.15);
  });
});

describe("moves to and from the signs and posters", () => {
  it("never pass through the building, its roof, the alley wall or the street", () => {
    const alley = alleyWallBox();
    for (const side of ["left", "back"] as const) {
      const closeUp = stopPose({ kind: "closeUp", side });
      for (const start of STARTS)
        for (const [from, to] of [
          [start, closeUp],
          [closeUp, start],
        ] as const)
          for (const p of path(from, to)) {
            expect(inside(BUILDING_BOX, p, 0.3)).toBe(false);
            expect(inside(alley, p, 0.15)).toBe(false);
            expect(p.y).toBeGreaterThan(STREET.curbHeightM + 0.5);
          }
    }
  });
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
