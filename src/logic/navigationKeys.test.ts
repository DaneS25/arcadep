import { describe, expect, it } from "vitest";
import { navCommandForKey, type KeyInput } from "./navigationKeys";

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

  it("leaves other keys alone", () => {
    for (const key of ["ArrowUp", "ArrowDown", "Tab", "Enter", "Escape", "a"]) {
      expect(navCommandForKey(press(key))).toBeUndefined();
    }
  });

  it("leaves presses with a modifier to the browser", () => {
    for (const mod of ["altKey", "ctrlKey", "metaKey", "shiftKey"] as const) {
      expect(
        navCommandForKey(press("ArrowLeft", { [mod]: true })),
      ).toBeUndefined();
    }
  });
});
