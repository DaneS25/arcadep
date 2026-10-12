import { describe, expect, it } from "vitest";
import {
  BUILDING,
  SIDES,
  STREET,
  interactionSpots,
  type Box,
  type Vec3,
} from "./buildingLayout";
import {
  CABINET_TEXTURE,
  SCREEN_VIEW,
  cabinetLayout,
  glowGeometryData,
  screenViewPose,
} from "./cabinetLayout";
import {
  CAMERA,
  planPoseTween,
  posePosition,
  samplePoseTween,
  sidePose,
} from "./cameraOrbit";

const EPS = 1e-9;

function inside(box: Box, p: Vec3, margin = 0): boolean {
  return (
    Math.abs(p.x - box.centre.x) < box.size.x / 2 + margin &&
    Math.abs(p.y - box.centre.y) < box.size.y / 2 + margin &&
    Math.abs(p.z - box.centre.z) < box.size.z / 2 + margin
  );
}

function bounds(boxes: readonly Box[]) {
  const min = (axis: "x" | "y" | "z") =>
    Math.min(...boxes.map((b) => b.centre[axis] - b.size[axis] / 2));
  const max = (axis: "x" | "y" | "z") =>
    Math.max(...boxes.map((b) => b.centre[axis] + b.size[axis] / 2));
  return {
    min: { x: min("x"), y: min("y"), z: min("z") },
    max: { x: max("x"), y: max("y"), z: max("z") },
  };
}

/** The building itself, walls to the top of the parapet. */
const BUILDING_BOX: Box = {
  centre: { x: 0, y: 7, z: 0 },
  size: { x: BUILDING.widthM, y: 14, z: BUILDING.depthM },
};

describe("cabinetLayout", () => {
  const layout = cabinetLayout();
  const spot = interactionSpots().find((s) => s.side === "front");

  it("fills the front interaction spot and keeps its id", () => {
    if (spot === undefined) throw new Error("no front spot");
    expect(layout.id).toBe("spot-front");
    const b = bounds(layout.parts);
    expect(b.min.x).toBeCloseTo(spot.position.x - spot.size.x / 2);
    expect(b.max.x).toBeCloseTo(spot.position.x + spot.size.x / 2);
    expect(b.min.y).toBeCloseTo(STREET.curbHeightM);
    expect(b.max.y).toBeCloseTo(spot.position.y + spot.size.y / 2);
    expect(b.min.z).toBeCloseTo(spot.position.z - spot.size.z / 2);
    expect(b.max.z).toBeCloseTo(spot.position.z + spot.size.z / 2);
  });

  it("stands clear of the front wall", () => {
    const b = bounds(layout.parts);
    expect(b.min.z).toBeGreaterThan(BUILDING.depthM / 2);
  });

  it("puts the screen and marquee just in front of the parts behind them, facing the street", () => {
    for (const face of layout.faces) {
      expect(face.normal).toEqual({ x: 0, y: 0, z: 1 });
      const [bl, br, tr, tl] = face.corners;
      expect(br.x).toBeGreaterThan(bl.x);
      expect(tl.y).toBeGreaterThan(bl.y);
      expect(tr.z).toBeCloseTo(bl.z);
      // Not inside any solid part, so it's never hidden or z-fighting.
      for (const corner of face.corners)
        for (const part of layout.parts)
          expect(inside(part, corner, -EPS)).toBe(false);
    }
  });

  it("keeps each face the same shape as its band of the texture", () => {
    for (const face of layout.faces) {
      const [bl, br, , tl] = face.corners;
      const aspect = (br.x - bl.x) / (tl.y - bl.y);
      const bandPx = (face.vMax - face.vMin) * CABINET_TEXTURE.heightPx;
      expect(aspect).toBeCloseTo(CABINET_TEXTURE.widthPx / bandPx, 5);
    }
  });

  it("splits the texture between marquee and screen without overlap", () => {
    const [marquee, screen] = layout.faces;
    expect(screen.vMin).toBe(0);
    expect(screen.vMax).toBe(marquee.vMin);
    expect(marquee.vMax).toBe(1);
  });
});

describe("screenViewPose", () => {
  const layout = cabinetLayout();
  const pose = screenViewPose(layout);
  const camera = posePosition(pose);

  it("looks at the screen's centre from in front of it", () => {
    expect(pose.target).toEqual(layout.screenCentre);
    expect(camera.z).toBeGreaterThan(layout.screenCentre.z);
    expect(Math.abs(camera.x - layout.screenCentre.x)).toBeLessThan(EPS);
    expect(camera.y).toBeGreaterThan(layout.screenCentre.y);
  });

  it("stands outside the cabinet, at about eye height", () => {
    for (const part of layout.parts)
      expect(inside(part, camera, 0.1)).toBe(false);
    expect(camera.y).toBeGreaterThan(1.3);
    expect(camera.y).toBeLessThan(2);
  });

  it("frames the whole screen in a 50° view", () => {
    const [, screen] = layout.faces;
    const height = screen.corners[3].y - screen.corners[0].y;
    const visible = 2 * SCREEN_VIEW.distanceM * Math.tan((25 * Math.PI) / 180);
    expect(height / visible).toBeGreaterThan(0.4);
    expect(height / visible).toBeLessThan(0.8);
  });

  it("is reached from every side's view without passing through the building or the cabinet", () => {
    for (const side of SIDES)
      for (const [from, to] of [
        [sidePose(side), pose],
        [pose, sidePose(side)],
      ] as const) {
        const tween = planPoseTween(from, to, false);
        for (let ms = 0; ms <= CAMERA.tweenMs; ms += 10) {
          const p = posePosition(samplePoseTween(tween, ms).pose);
          expect(inside(BUILDING_BOX, p, 0.5)).toBe(false);
          for (const part of layout.parts)
            expect(inside(part, p, 0.05)).toBe(false);
          expect(p.y).toBeGreaterThan(STREET.curbHeightM + 0.5);
        }
      }
  });
});

describe("glowGeometryData", () => {
  it("makes one textured quad per face", () => {
    const { faces } = cabinetLayout();
    const data = glowGeometryData(faces);
    expect(data.positions).toHaveLength(faces.length * 4 * 3);
    expect(data.uvs).toHaveLength(faces.length * 4 * 2);
    expect(data.indices).toEqual([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    const [marquee] = faces;
    expect(data.uvs.slice(0, 8)).toEqual([
      0,
      marquee.vMin,
      1,
      marquee.vMin,
      1,
      marquee.vMax,
      0,
      marquee.vMax,
    ]);
  });
});
