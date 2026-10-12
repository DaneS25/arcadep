import { describe, expect, it } from "vitest";
import { CLICK_SLOP_PX, isClick, toNdc } from "./pointer";

const rect = { left: 100, top: 50, width: 800, height: 400 };

describe("toNdc", () => {
  it("maps the corners and centre of the rect", () => {
    expect(toNdc({ x: 100, y: 50 }, rect)).toEqual({ x: -1, y: 1 });
    expect(toNdc({ x: 900, y: 450 }, rect)).toEqual({ x: 1, y: -1 });
    expect(toNdc({ x: 500, y: 250 }, rect)).toEqual({ x: 0, y: -0 });
  });

  it("has nothing for an empty rect", () => {
    expect(toNdc({ x: 0, y: 0 }, { ...rect, width: 0 })).toBeUndefined();
    expect(toNdc({ x: 0, y: 0 }, { ...rect, height: 0 })).toBeUndefined();
  });
});

describe("isClick", () => {
  it("counts a still press as a click", () => {
    expect(isClick({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(true);
    expect(isClick({ x: 10, y: 10 }, { x: 10 + CLICK_SLOP_PX, y: 10 })).toBe(
      true,
    );
  });

  it("counts a drag as not a click", () => {
    expect(isClick({ x: 10, y: 10 }, { x: 10 + CLICK_SLOP_PX, y: 11 })).toBe(
      false,
    );
    expect(isClick({ x: 0, y: 0 }, { x: 200, y: 0 })).toBe(false);
  });
});
