import { describe, expect, it } from "vitest";
import type { AppMode } from "./appState";
import { screenViewPose } from "./cabinetLayout";
import { sidePose } from "./cameraOrbit";
import { cameraCue, closeUpSide, stopPose } from "./cameraStops";

const EXPLORING: AppMode = { kind: "exploring" };
const focused = (side: "front" | "left"): AppMode => ({
  kind: "focused",
  side,
});
const panel = (side: "front" | "left"): AppMode => ({ kind: "panel", side });

describe("stopPose", () => {
  it("is the side view for a side and the screen view for the cabinet close-up", () => {
    expect(stopPose({ kind: "side", side: "left" })).toEqual(sidePose("left"));
    expect(stopPose({ kind: "closeUp", side: "front" })).toEqual(
      screenViewPose(),
    );
  });
});

describe("closeUpSide", () => {
  it("is the front only while its panel is open", () => {
    expect(closeUpSide(panel("front"))).toBe("front");
    expect(closeUpSide(focused("front"))).toBeUndefined();
    expect(closeUpSide(panel("left"))).toBeUndefined();
    expect(closeUpSide(EXPLORING)).toBeUndefined();
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

  it("passes other sides' snaps straight through", () => {
    expect(cameraCue(EXPLORING, focused("left"), "left")).toEqual({
      kind: "side",
      side: "left",
    });
    expect(
      cameraCue(focused("left"), panel("left"), undefined),
    ).toBeUndefined();
    expect(cameraCue(EXPLORING, panel("left"), "left")).toEqual({
      kind: "side",
      side: "left",
    });
  });
});
