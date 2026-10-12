import { describe, expect, it } from "vitest";
import { SIDES } from "./buildingLayout";
import { createCameraNavigator } from "./cameraNavigator";
import { CAMERA, sideView, type Orbit } from "./cameraOrbit";

describe("createCameraNavigator", () => {
  it("is idle until asked to move", () => {
    const nav = createCameraNavigator();
    expect(nav.update(16)).toEqual({ kind: "idle" });
    expect(nav.heading).toBeUndefined();
  });

  it("heads for the side it was given", () => {
    const nav = createCameraNavigator();
    nav.goTo(CAMERA.start, "right", false);
    expect(nav.heading).toBe("right");
  });

  it("moves over the tween time and then arrives on the side's view", () => {
    const nav = createCameraNavigator();
    nav.goTo(sideView("front"), "left", false);
    const first = nav.update(CAMERA.tweenMs / 2);
    expect(first.kind).toBe("moving");
    const last = nav.update(CAMERA.tweenMs / 2);
    expect(last).toEqual({
      kind: "arrived",
      orbit: sideView("left"),
      side: "left",
    });
    expect(nav.update(16)).toEqual({ kind: "idle" });
    expect(nav.heading).toBeUndefined();
  });

  it("cuts on the next frame under reduced motion", () => {
    const nav = createCameraNavigator();
    nav.goTo(sideView("front"), "right", true);
    expect(nav.update(0)).toEqual({
      kind: "arrived",
      orbit: sideView("right"),
      side: "right",
    });
  });

  it("replaces a running snap with a new one from where the camera is", () => {
    const nav = createCameraNavigator();
    nav.goTo(sideView("front"), "right", false);
    const step = nav.update(100);
    if (step.kind !== "moving") throw new Error("expected a moving step");
    nav.goTo(step.orbit, "back", false);
    expect(nav.heading).toBe("back");
    const end = nav.update(CAMERA.tweenMs);
    expect(end).toEqual({
      kind: "arrived",
      orbit: sideView("back"),
      side: "back",
    });
  });

  it("can reach every side", () => {
    const nav = createCameraNavigator();
    let orbit: Orbit = CAMERA.start;
    for (const side of SIDES) {
      nav.goTo(orbit, side, false);
      const step = nav.update(CAMERA.tweenMs);
      if (step.kind !== "arrived") throw new Error("expected to arrive");
      expect(step.side).toBe(side);
      orbit = step.orbit;
    }
  });

  it("stops the snap when cancelled", () => {
    const nav = createCameraNavigator();
    nav.goTo(sideView("front"), "right", false);
    nav.cancel();
    expect(nav.update(16)).toEqual({ kind: "idle" });
  });

  it("ignores negative frame deltas", () => {
    const nav = createCameraNavigator();
    nav.goTo(sideView("front"), "right", false);
    nav.update(-5000);
    const step = nav.update(CAMERA.tweenMs - 1);
    expect(step.kind).toBe("moving");
  });
});
