import { describe, expect, it } from "vitest";
import { createCameraNavigator } from "./cameraNavigator";
import { CAMERA, sideView, type Orbit } from "./cameraOrbit";

describe("createCameraNavigator", () => {
  it("is idle until asked to turn", () => {
    const nav = createCameraNavigator();
    expect(nav.update(16)).toEqual({ kind: "idle" });
    expect(nav.heading).toBeUndefined();
  });

  it("turns from the side nearest the camera", () => {
    const nav = createCameraNavigator();
    expect(nav.turn(CAMERA.start, "right", false)).toBe("right");
    expect(nav.heading).toBe("right");
  });

  it("moves over the tween time and then arrives on the side's view", () => {
    const nav = createCameraNavigator();
    nav.turn(sideView("front"), "left", false);
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
    nav.turn(sideView("front"), "right", true);
    expect(nav.update(0)).toEqual({
      kind: "arrived",
      orbit: sideView("right"),
      side: "right",
    });
  });

  it("counts a second press from the side already being headed for", () => {
    const nav = createCameraNavigator();
    nav.turn(sideView("front"), "right", false);
    const step = nav.update(100);
    if (step.kind !== "moving") throw new Error("expected a moving step");
    expect(nav.turn(step.orbit, "right", false)).toBe("back");
  });

  it("can reach every side by keyboard turns alone", () => {
    const nav = createCameraNavigator();
    let orbit: Orbit = CAMERA.start;
    const reached: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      nav.turn(orbit, "right", false);
      const step = nav.update(CAMERA.tweenMs);
      if (step.kind !== "arrived") throw new Error("expected to arrive");
      reached.push(step.side);
      orbit = step.orbit;
    }
    expect(reached).toEqual(["right", "back", "left", "front"]);
  });

  it("stops the snap when cancelled", () => {
    const nav = createCameraNavigator();
    nav.turn(sideView("front"), "right", false);
    nav.cancel();
    expect(nav.update(16)).toEqual({ kind: "idle" });
  });

  it("ignores negative frame deltas", () => {
    const nav = createCameraNavigator();
    nav.turn(sideView("front"), "right", false);
    nav.update(-5000);
    const step = nav.update(CAMERA.tweenMs - 1);
    expect(step.kind).toBe("moving");
  });
});
