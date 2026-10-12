/**
 * The app's interaction state machine: what the visitor is doing (looking round, focused
 * on a side, or reading a side's panel) and which interactive object the pointer is over.
 * Pure: the app feeds it events and applies what comes back (camera snaps, overlays).
 */

import { SIDES, type Side } from "./buildingLayout";
import { turnSide, type TurnDirection } from "./cameraOrbit";
import { sideOfId, spotId, type InteractiveId } from "./interactiveIds";

export type AppMode =
  | { readonly kind: "exploring" }
  | { readonly kind: "focused"; readonly side: Side }
  | { readonly kind: "panel"; readonly side: Side };

export type AppState = {
  readonly mode: AppMode;
  /** The interactive object under the pointer, if any. */
  readonly hovered: InteractiveId | undefined;
};

export type CycleDirection = "next" | "previous";

export type AppEvent =
  /** Arrow keys: the next side round from the focused one, or from `nearest` when exploring. */
  | {
      readonly kind: "turn";
      readonly direction: TurnDirection;
      readonly nearest: Side;
    }
  /** Tab and Shift+Tab: step through the sides in tab order, then let focus leave the page. */
  | { readonly kind: "cycle"; readonly direction: CycleDirection }
  /** Enter: open the focused side's panel. */
  | { readonly kind: "open" }
  /** Escape: close the panel, or drop the focus. */
  | { readonly kind: "close" }
  /** A click on an interactive object. */
  | { readonly kind: "activate"; readonly id: InteractiveId }
  /** The pointer moved onto an object, or off all of them. */
  | { readonly kind: "hover"; readonly id: InteractiveId | undefined }
  /** The visitor took the camera with the mouse. */
  | { readonly kind: "freeLook" };

export type Transition = {
  readonly state: AppState;
  /** False when the event meant nothing here, so a key press can go on to the browser. */
  readonly handled: boolean;
  /** The side the camera should snap to, if the event moved the focus to a new side. */
  readonly snapTo: Side | undefined;
};

export const INITIAL_STATE: AppState = {
  mode: { kind: "exploring" },
  hovered: undefined,
};

/** Tab order: the same way round as ArrowRight, starting at the front. */
export const TAB_ORDER: readonly Side[] = SIDES.reduce<Side[]>(
  (order, _side, i) => {
    const previous = order[i - 1];
    order.push(previous === undefined ? "front" : turnSide(previous, "right"));
    return order;
  },
  [],
);

function unhandled(state: AppState): Transition {
  return { state, handled: false, snapTo: undefined };
}

function withMode(state: AppState, mode: AppMode): AppState {
  return { ...state, mode };
}

function focusSide(state: AppState, side: Side): Transition {
  return {
    state: withMode(state, { kind: "focused", side }),
    handled: true,
    snapTo: side,
  };
}

function cycle(state: AppState, direction: CycleDirection): Transition {
  const { mode } = state;
  if (mode.kind === "panel") return unhandled(state);
  const step = direction === "next" ? 1 : -1;
  const index =
    mode.kind === "focused"
      ? TAB_ORDER.indexOf(mode.side) + step
      : direction === "next"
        ? 0
        : TAB_ORDER.length - 1;
  const side = TAB_ORDER[index];
  if (side === undefined) {
    // Past the last side (or before the first): drop the focus and let the browser
    // move focus on, so the scene never traps the keyboard.
    return {
      state: withMode(state, { kind: "exploring" }),
      handled: false,
      snapTo: undefined,
    };
  }
  return focusSide(state, side);
}

export function transition(state: AppState, event: AppEvent): Transition {
  const { mode } = state;
  switch (event.kind) {
    case "turn": {
      if (mode.kind === "panel") return unhandled(state);
      const from = mode.kind === "focused" ? mode.side : event.nearest;
      return focusSide(state, turnSide(from, event.direction));
    }
    case "cycle":
      return cycle(state, event.direction);
    case "open":
      if (mode.kind !== "focused") return unhandled(state);
      return {
        state: withMode(state, { kind: "panel", side: mode.side }),
        handled: true,
        snapTo: undefined,
      };
    case "close":
      if (mode.kind === "exploring") return unhandled(state);
      return {
        state: withMode(
          state,
          mode.kind === "panel"
            ? { kind: "focused", side: mode.side }
            : { kind: "exploring" },
        ),
        handled: true,
        snapTo: undefined,
      };
    case "activate": {
      const side = sideOfId(event.id);
      return {
        state: withMode(state, { kind: "panel", side }),
        handled: true,
        snapTo: side,
      };
    }
    case "hover":
      return {
        state: { ...state, hovered: event.id },
        handled: true,
        snapTo: undefined,
      };
    case "freeLook":
      if (mode.kind !== "focused") return unhandled(state);
      return {
        state: withMode(state, { kind: "exploring" }),
        handled: true,
        snapTo: undefined,
      };
  }
}

/** The object to light up: the one under the pointer, else the focused or open side's. */
export function highlightedId(state: AppState): InteractiveId | undefined {
  if (state.hovered !== undefined) return state.hovered;
  const { mode } = state;
  return mode.kind === "exploring" ? undefined : spotId(mode.side);
}
