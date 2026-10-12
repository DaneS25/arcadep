import { describe, expect, it } from "vitest";
import { SIDES, type Side } from "./buildingLayout";
import { screenViewPose } from "./cabinetLayout";
import { createCameraNavigator } from "./cameraNavigator";
import { CAMERA, sidePose, type CameraPose } from "./cameraOrbit";
import type { CameraStop } from "./cameraStops";

const side = (s: Side): CameraStop => ({ kind: "side", side: s });
const START: CameraPose = { target: CAMERA.target, orbit: CAMERA.start };

describe("createCameraNavigator", () => {
  it("is idle until asked to move", () => {
    const nav = createCameraNavigator();
    expect(nav.update(16)).toEqual({ kind: "idle" });
    expect(nav.heading).toBeUndefined();
  });

  it("heads for the stop it was given", () => {
    const nav = createCameraNavigator();
    nav.goTo(START, side("right"), false);
    expect(nav.heading).toEqual(side("right"));
  });

  it("moves over the tween time and then arrives on the side's view", () => {
    const nav = createCameraNavigator();
    nav.goTo(sidePose("front"), side("left"), false);
    const first = nav.update(CAMERA.tweenMs / 2);
    expect(first.kind).toBe("moving");
    const last = nav.update(CAMERA.tweenMs / 2);
    expect(last).toEqual({
      kind: "arrived",
      pose: sidePose("left"),
      stop: side("left"),
    });
    expect(nav.update(16)).toEqual({ kind: "idle" });
    expect(nav.heading).toBeUndefined();
  });

  it("cuts on the next frame under reduced motion", () => {
    const nav = createCameraNavigator();
    nav.goTo(sidePose("front"), side("right"), true);
    expect(nav.update(0)).toEqual({
      kind: "arrived",
      pose: sidePose("right"),
      stop: side("right"),
    });
  });

  it("moves in to the cabinet's screen and back out", () => {
    const nav = createCameraNavigator();
    const closeUp: CameraStop = { kind: "closeUp", side: "front" };
    nav.goTo(sidePose("front"), closeUp, false);
    expect(nav.update(CAMERA.tweenMs / 2).kind).toBe("moving");
    expect(nav.update(CAMERA.tweenMs / 2)).toEqual({
      kind: "arrived",
      pose: screenViewPose(),
      stop: closeUp,
    });
    nav.goTo(screenViewPose(), side("front"), true);
    expect(nav.update(0)).toEqual({
      kind: "arrived",
      pose: sidePose("front"),
      stop: side("front"),
    });
  });

  it("replaces a running move with a new one from where the camera is", () => {
    const nav = createCameraNavigator();
    nav.goTo(sidePose("front"), side("right"), false);
    const step = nav.update(100);
    if (step.kind !== "moving") throw new Error("expected a moving step");
    nav.goTo(step.pose, side("back"), false);
    expect(nav.heading).toEqual(side("back"));
    const end = nav.update(CAMERA.tweenMs);
    expect(end).toEqual({
      kind: "arrived",
      pose: sidePose("back"),
      stop: side("back"),
    });
  });

  it("can reach every side", () => {
    const nav = createCameraNavigator();
    let pose = START;
    for (const s of SIDES) {
      nav.goTo(pose, side(s), false);
      const step = nav.update(CAMERA.tweenMs);
      if (step.kind !== "arrived") throw new Error("expected to arrive");
      expect(step.stop).toEqual(side(s));
      pose = step.pose;
    }
  });

  it("stops the move when cancelled", () => {
    const nav = createCameraNavigator();
    nav.goTo(sidePose("front"), side("right"), false);
    nav.cancel();
    expect(nav.update(16)).toEqual({ kind: "idle" });
  });

  it("ignores negative frame deltas", () => {
    const nav = createCameraNavigator();
    nav.goTo(sidePose("front"), side("right"), false);
    nav.update(-5000);
    const step = nav.update(CAMERA.tweenMs - 1);
    expect(step.kind).toBe("moving");
  });
});
