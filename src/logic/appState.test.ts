import { describe, expect, it } from "vitest";
import {
  INITIAL_STATE,
  TAB_ORDER,
  highlightedId,
  transition,
  type AppEvent,
  type AppMode,
  type AppState,
} from "./appState";

function inMode(mode: AppMode): AppState {
  return { ...INITIAL_STATE, mode };
}

/** Runs events in order and returns the final state. */
function run(state: AppState, events: readonly AppEvent[]): AppState {
  return events.reduce((s, e) => transition(s, e).state, state);
}

const exploring = inMode({ kind: "exploring" });

describe("TAB_ORDER", () => {
  it("goes round the same way as ArrowRight, from the front", () => {
    expect(TAB_ORDER).toEqual(["front", "right", "back", "left"]);
  });
});

describe("transition", () => {
  it("starts out exploring with nothing hovered", () => {
    expect(INITIAL_STATE).toEqual({
      mode: { kind: "exploring" },
      hovered: undefined,
    });
  });

  describe("turn (arrow keys)", () => {
    it("focuses the next side round from the nearest when exploring", () => {
      const t = transition(exploring, {
        kind: "turn",
        direction: "right",
        nearest: "front",
      });
      expect(t).toEqual({
        state: inMode({ kind: "focused", side: "right" }),
        handled: true,
        snapTo: "right",
      });
    });

    it("counts from the focused side, so two quick presses move two sides", () => {
      const state = run(exploring, [
        { kind: "turn", direction: "right", nearest: "front" },
        { kind: "turn", direction: "right", nearest: "front" },
      ]);
      expect(state.mode).toEqual({ kind: "focused", side: "back" });
    });

    it("turns left the other way round", () => {
      const t = transition(inMode({ kind: "focused", side: "front" }), {
        kind: "turn",
        direction: "left",
        nearest: "back",
      });
      expect(t.state.mode).toEqual({ kind: "focused", side: "left" });
      expect(t.snapTo).toBe("left");
    });

    it("does nothing while a panel is open", () => {
      const panel = inMode({ kind: "panel", side: "back" });
      expect(
        transition(panel, { kind: "turn", direction: "left", nearest: "back" }),
      ).toEqual({ state: panel, handled: false, snapTo: undefined });
    });
  });

  describe("cycle (Tab)", () => {
    it("starts at the front going forwards and at the left going back", () => {
      expect(
        transition(exploring, { kind: "cycle", direction: "next" }).state.mode,
      ).toEqual({ kind: "focused", side: "front" });
      expect(
        transition(exploring, { kind: "cycle", direction: "previous" }).state
          .mode,
      ).toEqual({ kind: "focused", side: "left" });
    });

    it("visits every side in tab order and snaps the camera to each", () => {
      let state = exploring;
      const visited: (string | undefined)[] = [];
      for (let i = 0; i < 4; i += 1) {
        const t = transition(state, { kind: "cycle", direction: "next" });
        expect(t.handled).toBe(true);
        visited.push(t.snapTo);
        state = t.state;
      }
      expect(visited).toEqual(["front", "right", "back", "left"]);
    });

    it("lets focus leave the page after the last side, so the keyboard is never trapped", () => {
      const forward = transition(inMode({ kind: "focused", side: "left" }), {
        kind: "cycle",
        direction: "next",
      });
      expect(forward).toEqual({
        state: exploring,
        handled: false,
        snapTo: undefined,
      });
      const back = transition(inMode({ kind: "focused", side: "front" }), {
        kind: "cycle",
        direction: "previous",
      });
      expect(back.state).toEqual(exploring);
      expect(back.handled).toBe(false);
    });

    it("steps backwards with Shift+Tab", () => {
      const t = transition(inMode({ kind: "focused", side: "back" }), {
        kind: "cycle",
        direction: "previous",
      });
      expect(t.state.mode).toEqual({ kind: "focused", side: "right" });
    });

    it("leaves Tab to the panel while one is open", () => {
      const panel = inMode({ kind: "panel", side: "front" });
      expect(
        transition(panel, { kind: "cycle", direction: "next" }).handled,
      ).toBe(false);
    });
  });

  describe("open and close (Enter and Escape)", () => {
    it("opens the focused side's panel without moving the camera", () => {
      const t = transition(inMode({ kind: "focused", side: "back" }), {
        kind: "open",
      });
      expect(t).toEqual({
        state: inMode({ kind: "panel", side: "back" }),
        handled: true,
        snapTo: undefined,
      });
    });

    it("ignores Enter when nothing is focused or a panel is already open", () => {
      expect(transition(exploring, { kind: "open" }).handled).toBe(false);
      const panel = inMode({ kind: "panel", side: "back" });
      expect(transition(panel, { kind: "open" }).state).toBe(panel);
    });

    it("closes a panel back to its focused side, then drops the focus", () => {
      const panel = inMode({ kind: "panel", side: "right" });
      const once = transition(panel, { kind: "close" });
      expect(once.state.mode).toEqual({ kind: "focused", side: "right" });
      expect(once.handled).toBe(true);
      const twice = transition(once.state, { kind: "close" });
      expect(twice.state.mode).toEqual({ kind: "exploring" });
      expect(twice.handled).toBe(true);
      expect(transition(twice.state, { kind: "close" }).handled).toBe(false);
    });

    it("opens and closes each side by keyboard alone", () => {
      let state = exploring;
      for (const side of TAB_ORDER) {
        state = transition(state, { kind: "cycle", direction: "next" }).state;
        state = transition(state, { kind: "open" }).state;
        expect(state.mode).toEqual({ kind: "panel", side });
        state = transition(state, { kind: "close" }).state;
        expect(state.mode).toEqual({ kind: "focused", side });
      }
    });
  });

  describe("activate (click)", () => {
    it("opens the clicked side's panel and snaps the camera there", () => {
      const t = transition(exploring, { kind: "activate", id: "spot-left" });
      expect(t).toEqual({
        state: inMode({ kind: "panel", side: "left" }),
        handled: true,
        snapTo: "left",
      });
    });

    it("switches to another side's panel from an open one", () => {
      const t = transition(inMode({ kind: "panel", side: "front" }), {
        kind: "activate",
        id: "spot-back",
      });
      expect(t.state.mode).toEqual({ kind: "panel", side: "back" });
    });
  });

  describe("hover", () => {
    it("tracks the hovered id without changing the mode", () => {
      const focused = inMode({ kind: "focused", side: "front" });
      const on = transition(focused, { kind: "hover", id: "spot-front" });
      expect(on.state).toEqual({ ...focused, hovered: "spot-front" });
      expect(on.snapTo).toBeUndefined();
      const off = transition(on.state, { kind: "hover", id: undefined });
      expect(off.state).toEqual(focused);
    });
  });

  describe("freeLook (mouse orbit)", () => {
    it("drops the focus", () => {
      const t = transition(inMode({ kind: "focused", side: "left" }), {
        kind: "freeLook",
      });
      expect(t.state).toEqual(exploring);
    });

    it("leaves exploring and an open panel alone", () => {
      expect(transition(exploring, { kind: "freeLook" }).handled).toBe(false);
      const panel = inMode({ kind: "panel", side: "left" });
      expect(transition(panel, { kind: "freeLook" }).state).toBe(panel);
    });
  });
});

describe("highlightedId", () => {
  it("lights nothing while exploring with nothing hovered", () => {
    expect(highlightedId(exploring)).toBeUndefined();
  });

  it("lights the focused or open side's spot", () => {
    expect(highlightedId(inMode({ kind: "focused", side: "back" }))).toBe(
      "spot-back",
    );
    expect(highlightedId(inMode({ kind: "panel", side: "right" }))).toBe(
      "spot-right",
    );
  });

  it("prefers the hovered spot", () => {
    const state: AppState = {
      mode: { kind: "focused", side: "back" },
      hovered: "spot-front",
    };
    expect(highlightedId(state)).toBe("spot-front");
  });
});
