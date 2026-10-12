import { describe, expect, it } from "vitest";
import {
  alleyWallBox,
  buildingFootprint,
  buildingHeightM,
  SIDES,
  sideAzimuthRad,
  sideNormal,
  type Box,
  type Vec3,
} from "./buildingLayout";
import {
  CAMERA,
  clampOrbit,
  easeInOutCubic,
  lerpOrbit,
  nearestSide,
  orbitPosition,
  planPoseTween,
  planTween,
  posePosition,
  samplePoseTween,
  sampleTween,
  sidePose,
  shortestTurnRad,
  sideView,
  turnSide,
  wrapAngleRad,
  type CameraPose,
  type Orbit,
} from "./cameraOrbit";

const EPS = 1e-9;

function insideBox(p: Vec3, box: Box, marginM: number): boolean {
  return (
    Math.abs(p.x - box.centre.x) <= box.size.x / 2 + marginM &&
    Math.abs(p.y - box.centre.y) <= box.size.y / 2 + marginM &&
    Math.abs(p.z - box.centre.z) <= box.size.z / 2 + marginM
  );
}

describe("wrapAngleRad and shortestTurnRad", () => {
  it("wraps angles into [0, 2π)", () => {
    expect(wrapAngleRad(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
    expect(wrapAngleRad(5 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngleRad(0)).toBe(0);
  });

  it("takes the shorter way round", () => {
    expect(shortestTurnRad(0, (3 * Math.PI) / 2)).toBeCloseTo(-Math.PI / 2);
    expect(shortestTurnRad((3 * Math.PI) / 2, 0)).toBeCloseTo(Math.PI / 2);
    expect(shortestTurnRad(0.1, 0.3)).toBeCloseTo(0.2);
  });
});

describe("clampOrbit", () => {
  it("keeps an orbit inside the limits unchanged", () => {
    const orbit = { azimuthRad: 1, polarRad: 1, distanceM: 20 };
    expect(clampOrbit(orbit)).toEqual(orbit);
  });

  it("stops the camera tilting under the street or straight down", () => {
    expect(
      clampOrbit({ azimuthRad: 0, polarRad: 3, distanceM: 20 }).polarRad,
    ).toBe(CAMERA.maxPolarRad);
    expect(
      clampOrbit({ azimuthRad: 0, polarRad: 0, distanceM: 20 }).polarRad,
    ).toBe(CAMERA.minPolarRad);
  });

  it("clamps the zoom both ways", () => {
    expect(
      clampOrbit({ azimuthRad: 0, polarRad: 1, distanceM: 1 }).distanceM,
    ).toBe(CAMERA.minDistanceM);
    expect(
      clampOrbit({ azimuthRad: 0, polarRad: 1, distanceM: 99 }).distanceM,
    ).toBe(CAMERA.maxDistanceM);
  });
});

describe("camera limits keep the camera outside the scene", () => {
  const building: Box = {
    centre: { x: 0, y: buildingHeightM() / 2, z: 0 },
    size: {
      x: buildingFootprint().maxX * 2,
      y: buildingHeightM(),
      z: buildingFootprint().maxZ * 2,
    },
  };

  const samples: Orbit[] = [];
  for (let a = 0; a < 72; a += 1) {
    for (const polarRad of [CAMERA.minPolarRad, 1, CAMERA.maxPolarRad]) {
      for (const distanceM of [CAMERA.minDistanceM, 20, CAMERA.maxDistanceM]) {
        samples.push({ azimuthRad: (a * Math.PI) / 36, polarRad, distanceM });
      }
    }
  }

  it("never goes under the street", () => {
    for (const orbit of samples) {
      expect(orbitPosition(orbit).y).toBeGreaterThan(1);
    }
  });

  it("never enters the building or the alley wall", () => {
    for (const orbit of samples) {
      const p = orbitPosition(orbit);
      expect(insideBox(p, building, 0.5)).toBe(false);
      expect(insideBox(p, alleyWallBox(), 0.5)).toBe(false);
    }
  });

  it("keeps the side views, the start view and the target inside the limits", () => {
    for (const orbit of [...SIDES.map(sideView), CAMERA.start]) {
      const clamped = clampOrbit(orbit);
      expect(clamped.polarRad).toBeCloseTo(orbit.polarRad);
      expect(clamped.distanceM).toBeCloseTo(orbit.distanceM);
    }
  });
});

describe("orbitPosition", () => {
  it("puts azimuth 0 in front of the building (+z)", () => {
    const p = orbitPosition({
      azimuthRad: 0,
      polarRad: Math.PI / 2,
      distanceM: 10,
    });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(CAMERA.target.y);
    expect(p.z).toBeCloseTo(10);
  });

  it("places each side view out along that side's normal", () => {
    for (const side of SIDES) {
      const p = orbitPosition(sideView(side));
      const n = sideNormal(side);
      const ground = Math.hypot(p.x - CAMERA.target.x, p.z - CAMERA.target.z);
      expect(p.x / ground).toBeCloseTo(n.x);
      expect(p.z / ground).toBeCloseTo(n.z);
      expect(p.y).toBeGreaterThan(CAMERA.target.y);
    }
  });
});

describe("nearestSide and turnSide", () => {
  it("finds the side for each side's own azimuth and nearby angles", () => {
    for (const side of SIDES) {
      expect(nearestSide(sideAzimuthRad(side))).toBe(side);
      expect(nearestSide(sideAzimuthRad(side) + 0.6)).toBe(side);
      expect(nearestSide(sideAzimuthRad(side) - 0.6)).toBe(side);
    }
    expect(nearestSide(-0.1)).toBe("front");
    expect(nearestSide(CAMERA.start.azimuthRad)).toBe("front");
  });

  it("walks right from the front to the right, back, left and front again", () => {
    const visited = ["front"];
    let side = turnSide("front", "right");
    while (side !== "front") {
      visited.push(side);
      side = turnSide(side, "right");
    }
    expect(visited).toEqual(["front", "right", "back", "left"]);
  });

  it("walks left in the SIDES order", () => {
    for (const [i, side] of SIDES.entries()) {
      expect(turnSide(side, "left")).toBe(SIDES[(i + 1) % SIDES.length]);
    }
  });

  it("makes each turn a quarter turn", () => {
    for (const side of SIDES) {
      for (const direction of ["left", "right"] as const) {
        const turn = shortestTurnRad(
          sideAzimuthRad(side),
          sideAzimuthRad(turnSide(side, direction)),
        );
        expect(Math.abs(turn)).toBeCloseTo(Math.PI / 2);
      }
    }
  });
});

describe("tweens", () => {
  const front = sideView("front");
  const left = sideView("left");

  it("eases from 0 to 1 symmetrically", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1);
  });

  it("plans a timed tween normally and a cut under reduced motion", () => {
    expect(planTween(front, left, false).durationMs).toBe(CAMERA.tweenMs);
    expect(planTween(front, left, true).durationMs).toBe(0);
  });

  it("starts at the first view and ends exactly on the second", () => {
    const tween = planTween(front, left, false);
    const start = sampleTween(tween, 0);
    expect(start.done).toBe(false);
    expect(start.orbit.azimuthRad).toBeCloseTo(front.azimuthRad);
    const end = sampleTween(tween, CAMERA.tweenMs);
    expect(end).toEqual({ orbit: left, done: true });
    expect(sampleTween(tween, CAMERA.tweenMs * 3).done).toBe(true);
  });

  it("turns the short way: front to left passes through azimuths just under 2π", () => {
    const mid = sampleTween(planTween(front, left, false), CAMERA.tweenMs / 2);
    expect(mid.orbit.azimuthRad).toBeCloseTo((7 * Math.PI) / 4);
  });

  it("is a pure function of elapsed time", () => {
    const tween = planTween(front, sideView("right"), false);
    expect(sampleTween(tween, 300)).toEqual(sampleTween(tween, 300));
  });

  it("interpolates pitch and zoom too", () => {
    const from: Orbit = { azimuthRad: 0, polarRad: 1, distanceM: 30 };
    const to: Orbit = { azimuthRad: 0, polarRad: 0.8, distanceM: 20 };
    const mid = sampleTween(planTween(from, to, false), CAMERA.tweenMs / 2);
    expect(mid.orbit.polarRad).toBeCloseTo(0.9);
    expect(mid.orbit.distanceM).toBeCloseTo(25);
  });

  it("cuts straight to the end under reduced motion", () => {
    const sample = sampleTween(planTween(front, left, true), 0);
    expect(sample.done).toBe(true);
    expect(Math.abs(sample.orbit.azimuthRad - left.azimuthRad)).toBeLessThan(
      EPS,
    );
  });
});

describe("pose tweens", () => {
  const close: CameraPose = {
    target: { x: -3, y: 1.45, z: 5.75 },
    orbit: { azimuthRad: 0, polarRad: 1.4, distanceM: 0.9 },
  };

  it("starts on the first pose and ends exactly on the second, unclamped", () => {
    const tween = planPoseTween(sidePose("front"), close, false);
    expect(samplePoseTween(tween, 0)).toEqual({
      pose: sidePose("front"),
      done: false,
    });
    expect(samplePoseTween(tween, CAMERA.tweenMs)).toEqual({
      pose: close,
      done: true,
    });
  });

  it("cuts under reduced motion", () => {
    const tween = planPoseTween(sidePose("front"), close, true);
    expect(tween.durationMs).toBe(0);
    expect(samplePoseTween(tween, 0)).toEqual({ pose: close, done: true });
  });

  it("slides the target half way at the middle", () => {
    const mid = samplePoseTween(
      planPoseTween(sidePose("front"), close, false),
      CAMERA.tweenMs / 2,
    );
    expect(mid.pose.target.x).toBeCloseTo(
      (CAMERA.target.x + close.target.x) / 2,
    );
    expect(mid.pose.orbit.distanceM).toBeCloseTo(
      (CAMERA.sideDistanceM + close.orbit.distanceM) / 2,
    );
  });

  it("puts a side pose where the side's orbit puts the camera", () => {
    expect(posePosition(sidePose("left"))).toEqual(
      orbitPosition(sideView("left")),
    );
  });

  it("matches the orbit tween for orbit-only moves", () => {
    const from = sideView("front");
    const to = sideView("left");
    const a = sampleTween(planTween(from, to, false), 300).orbit;
    expect(lerpOrbit(from, to, easeInOutCubic(300 / CAMERA.tweenMs))).toEqual(
      a,
    );
  });
});
