import { describe, expect, it } from "vitest";
import { listKeyCommand, listTarget } from "./listKeys";

const key = (k: string, mods: Partial<Record<string, boolean>> = {}) => ({
  key: k,
  altKey: mods.altKey ?? false,
  ctrlKey: mods.ctrlKey ?? false,
  metaKey: mods.metaKey ?? false,
  shiftKey: mods.shiftKey ?? false,
});

const ELSEWHERE = { focusedItem: undefined, typing: false };
const ON_ITEM = { focusedItem: 1, typing: false };

describe("listKeyCommand", () => {
  it("maps Up, Down, Home and End wherever focus is in the panel", () => {
    for (const focus of [ELSEWHERE, ON_ITEM]) {
      expect(listKeyCommand(key("ArrowDown"), focus)).toBe("next");
      expect(listKeyCommand(key("ArrowUp"), focus)).toBe("previous");
      expect(listKeyCommand(key("Home"), focus)).toBe("first");
      expect(listKeyCommand(key("End"), focus)).toBe("last");
    }
  });

  it("maps Left and Right only while an item has focus", () => {
    expect(listKeyCommand(key("ArrowRight"), ON_ITEM)).toBe("next");
    expect(listKeyCommand(key("ArrowLeft"), ON_ITEM)).toBe("previous");
    expect(listKeyCommand(key("ArrowRight"), ELSEWHERE)).toBeUndefined();
    expect(listKeyCommand(key("ArrowLeft"), ELSEWHERE)).toBeUndefined();
  });

  it("leaves a text field, modified presses and other keys alone", () => {
    const typing = { focusedItem: undefined, typing: true };
    expect(listKeyCommand(key("ArrowDown"), typing)).toBeUndefined();
    expect(listKeyCommand(key("Home"), typing)).toBeUndefined();
    expect(
      listKeyCommand(key("ArrowDown", { shiftKey: true }), ON_ITEM),
    ).toBeUndefined();
    expect(
      listKeyCommand(key("End", { ctrlKey: true }), ELSEWHERE),
    ).toBeUndefined();
    expect(listKeyCommand(key("Enter"), ON_ITEM)).toBeUndefined();
    expect(listKeyCommand(key("Escape"), ELSEWHERE)).toBeUndefined();
    expect(listKeyCommand(key("Tab"), ELSEWHERE)).toBeUndefined();
  });
});

describe("listTarget", () => {
  it("steps from the chosen item when no item has focus", () => {
    expect(listTarget(0, 3, "next")).toBe(1);
    expect(listTarget(2, 3, "previous")).toBe(1);
  });

  it("steps from the focused item when one has focus", () => {
    expect(listTarget(0, 3, "next", 1)).toBe(2);
    expect(listTarget(2, 3, "previous", 0)).toBe(0);
  });

  it("stops at both ends rather than wrapping", () => {
    expect(listTarget(2, 3, "next")).toBe(2);
    expect(listTarget(0, 3, "previous")).toBe(0);
  });

  it("jumps to the first and last item", () => {
    expect(listTarget(1, 3, "first")).toBe(0);
    expect(listTarget(1, 3, "last")).toBe(2);
    expect(listTarget(0, 1, "last")).toBe(0);
  });

  it("stays on 0 with no items", () => {
    expect(listTarget(0, 0, "next")).toBe(0);
    expect(listTarget(0, 0, "last")).toBe(0);
  });
});
