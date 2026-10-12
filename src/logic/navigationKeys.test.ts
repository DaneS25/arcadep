import { describe, expect, it } from "vitest";
import {
  eventForCommand,
  navCommandForKey,
  type KeyInput,
} from "./navigationKeys";

function press(key: string, mods: Partial<KeyInput> = {}): KeyInput {
  return {
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...mods,
  };
}

describe("navCommandForKey", () => {
  it("turns left and right with the arrow keys", () => {
    expect(navCommandForKey(press("ArrowLeft"))).toEqual({
      kind: "turn",
      direction: "left",
    });
    expect(navCommandForKey(press("ArrowRight"))).toEqual({
      kind: "turn",
      direction: "right",
    });
  });

  it("cycles with Tab and Shift+Tab", () => {
    expect(navCommandForKey(press("Tab"))).toEqual({
      kind: "cycle",
      direction: "next",
    });
    expect(navCommandForKey(press("Tab", { shiftKey: true }))).toEqual({
      kind: "cycle",
      direction: "previous",
    });
  });

  it("opens with Enter and closes with Escape", () => {
    expect(navCommandForKey(press("Enter"))).toEqual({ kind: "open" });
    expect(navCommandForKey(press("Escape"))).toEqual({ kind: "close" });
  });

  it("leaves other keys alone", () => {
    for (const key of ["ArrowUp", "ArrowDown", " ", "a"]) {
      expect(navCommandForKey(press(key))).toBeUndefined();
    }
  });

  it("leaves presses with a modifier to the browser", () => {
    for (const mod of ["altKey", "ctrlKey", "metaKey"] as const) {
      for (const key of ["ArrowLeft", "Tab", "Enter", "Escape"]) {
        expect(navCommandForKey(press(key, { [mod]: true }))).toBeUndefined();
      }
    }
  });

  it("only counts Shift with Tab", () => {
    for (const key of ["ArrowLeft", "ArrowRight", "Enter", "Escape"]) {
      expect(navCommandForKey(press(key, { shiftKey: true }))).toBeUndefined();
    }
  });
});

describe("eventForCommand", () => {
  it("adds the nearest side to a turn", () => {
    expect(
      eventForCommand({ kind: "turn", direction: "left" }, "back"),
    ).toEqual({ kind: "turn", direction: "left", nearest: "back" });
  });

  it("passes the other commands through", () => {
    expect(eventForCommand({ kind: "open" }, "back")).toEqual({ kind: "open" });
    expect(
      eventForCommand({ kind: "cycle", direction: "next" }, "back"),
    ).toEqual({ kind: "cycle", direction: "next" });
  });
});
