import { describe, expect, it } from "vitest";
import { trapMove } from "./focusTrap";

describe("trapMove", () => {
  it("stays put when there is nothing to focus", () => {
    expect(trapMove(-1, 0, false)).toEqual({ kind: "stay" });
    expect(trapMove(-1, 0, true)).toEqual({ kind: "stay" });
  });

  it("lets the browser move between elements in the middle", () => {
    expect(trapMove(0, 3, false)).toEqual({ kind: "native" });
    expect(trapMove(1, 3, false)).toEqual({ kind: "native" });
    expect(trapMove(1, 3, true)).toEqual({ kind: "native" });
    expect(trapMove(2, 3, true)).toEqual({ kind: "native" });
  });

  it("wraps from the last to the first going forwards", () => {
    expect(trapMove(2, 3, false)).toEqual({ kind: "move", index: 0 });
  });

  it("wraps from the first to the last going backwards", () => {
    expect(trapMove(0, 3, true)).toEqual({ kind: "move", index: 2 });
  });

  it("keeps a single element focused either way", () => {
    expect(trapMove(0, 1, false)).toEqual({ kind: "move", index: 0 });
    expect(trapMove(0, 1, true)).toEqual({ kind: "move", index: 0 });
  });

  it("brings focus back inside from outside the list", () => {
    expect(trapMove(-1, 3, false)).toEqual({ kind: "move", index: 0 });
    expect(trapMove(-1, 3, true)).toEqual({ kind: "move", index: 2 });
    expect(trapMove(7, 3, false)).toEqual({ kind: "move", index: 0 });
  });
});
