import { describe, expect, it } from "vitest";
import { clampPage, isAtLimit, pageCommandForKey, stepPage } from "./pager";

const key = (
  k: string,
  mods: Partial<
    Record<"altKey" | "ctrlKey" | "metaKey" | "shiftKey", boolean>
  > = {},
) => ({
  key: k,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe("pageCommandForKey", () => {
  it("maps the arrows, Page Up/Down, Home and End", () => {
    expect(pageCommandForKey(key("ArrowRight"))).toBe("next");
    expect(pageCommandForKey(key("ArrowLeft"))).toBe("previous");
    expect(pageCommandForKey(key("PageDown"))).toBe("next");
    expect(pageCommandForKey(key("PageUp"))).toBe("previous");
    expect(pageCommandForKey(key("Home"))).toBe("first");
    expect(pageCommandForKey(key("End"))).toBe("last");
  });

  it("leaves other keys and modified presses alone", () => {
    expect(pageCommandForKey(key("Enter"))).toBeUndefined();
    expect(pageCommandForKey(key("Tab"))).toBeUndefined();
    expect(
      pageCommandForKey(key("ArrowRight", { altKey: true })),
    ).toBeUndefined();
    expect(
      pageCommandForKey(key("ArrowLeft", { shiftKey: true })),
    ).toBeUndefined();
  });
});

describe("stepPage", () => {
  it("moves one page at a time and stops at both ends", () => {
    expect(stepPage(0, 3, "next")).toBe(1);
    expect(stepPage(2, 3, "next")).toBe(2);
    expect(stepPage(1, 3, "previous")).toBe(0);
    expect(stepPage(0, 3, "previous")).toBe(0);
  });

  it("jumps to the first and last page", () => {
    expect(stepPage(1, 3, "first")).toBe(0);
    expect(stepPage(0, 3, "last")).toBe(2);
  });

  it("stays on 0 with no pages", () => {
    for (const command of ["next", "previous", "first", "last"] as const)
      expect(stepPage(0, 0, command)).toBe(0);
  });
});

describe("clampPage and isAtLimit", () => {
  it("keeps an index in range", () => {
    expect(clampPage(5, 3)).toBe(2);
    expect(clampPage(-1, 3)).toBe(0);
    expect(clampPage(Number.NaN, 3)).toBe(0);
  });

  it("marks previous unavailable on the first page and next on the last", () => {
    expect(isAtLimit(0, 3, "previous")).toBe(true);
    expect(isAtLimit(0, 3, "next")).toBe(false);
    expect(isAtLimit(2, 3, "next")).toBe(true);
    expect(isAtLimit(1, 1, "next")).toBe(true);
  });
});
