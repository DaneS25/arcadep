/**
 * Keeps track of the camera's snap between sides: which side it is heading for and how far
 * the tween has run. Time comes in as frame deltas, so tests drive it directly.
 */

import type { Side } from "./buildingLayout";
import {
  nearestSide,
  planTween,
  sampleTween,
  sideView,
  turnSide,
  type CameraTween,
  type Orbit,
  type TurnDirection,
} from "./cameraOrbit";

export type NavigatorStep =
  | { readonly kind: "idle" }
  | { readonly kind: "moving"; readonly orbit: Orbit }
  | { readonly kind: "arrived"; readonly orbit: Orbit; readonly side: Side };

export type CameraNavigator = {
  /** The side the current snap is heading for, if one is running. */
  readonly heading: Side | undefined;
  /**
   * Starts a snap to the next side round from `current`. While a snap is running, the turn
   * counts from the side it is heading for, so pressing twice moves two sides.
   */
  turn(current: Orbit, direction: TurnDirection, reducedMotion: boolean): Side;
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
    turn(current, direction, reducedMotion) {
      const from = move?.side ?? nearestSide(current.azimuthRad);
      const side = turnSide(from, direction);
      move = {
        tween: planTween(current, sideView(side), reducedMotion),
        side,
        elapsedMs: 0,
      };
      return side;
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
