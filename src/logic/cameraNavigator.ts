/**
 * Keeps track of the camera's snap between sides: which side it is heading for and how far
 * the tween has run. Time comes in as frame deltas, so tests drive it directly.
 */

import type { Side } from "./buildingLayout";
import {
  planTween,
  sampleTween,
  sideView,
  type CameraTween,
  type Orbit,
} from "./cameraOrbit";

export type NavigatorStep =
  | { readonly kind: "idle" }
  | { readonly kind: "moving"; readonly orbit: Orbit }
  | { readonly kind: "arrived"; readonly orbit: Orbit; readonly side: Side };

export type CameraNavigator = {
  /** The side the current snap is heading for, if one is running. */
  readonly heading: Side | undefined;
  /**
   * Starts a snap from `current` to `side`'s view, replacing any running snap. The app
   * state machine picks the side (task 7), so two quick presses still move two sides.
   */
  goTo(current: Orbit, side: Side, reducedMotion: boolean): void;
  /** Moves the snap on by `dtMs`; call once a frame. */
  update(dtMs: number): NavigatorStep;
  /** Drops the running snap, for example when the visitor grabs the camera with the mouse. */
  cancel(): void;
};

export function createCameraNavigator(): CameraNavigator {
  let move: { tween: CameraTween; side: Side; elapsedMs: number } | undefined;

  return {
    get heading() {
      return move?.side;
    },
    goTo(current, side, reducedMotion) {
      move = {
        tween: planTween(current, sideView(side), reducedMotion),
        side,
        elapsedMs: 0,
      };
    },
    update(dtMs) {
      if (move === undefined) return { kind: "idle" };
      move.elapsedMs += Math.max(0, dtMs);
      const sample = sampleTween(move.tween, move.elapsedMs);
      if (!sample.done) return { kind: "moving", orbit: sample.orbit };
      const { side } = move;
      move = undefined;
      return { kind: "arrived", orbit: sample.orbit, side };
    },
    cancel() {
      move = undefined;
    },
  };
}
