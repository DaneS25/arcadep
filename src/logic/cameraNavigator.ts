/**
 * Keeps track of the camera's move to a stop (a side's view or a close-up): where it is
 * heading and how far the tween has run. Time comes in as frame deltas, so tests drive it
 * directly.
 */

import {
  planPoseTween,
  samplePoseTween,
  type CameraPose,
  type PoseTween,
} from "./cameraOrbit";
import { stopPose, type CameraStop } from "./cameraStops";

export type NavigatorStep =
  | { readonly kind: "idle" }
  | { readonly kind: "moving"; readonly pose: CameraPose }
  | {
      readonly kind: "arrived";
      readonly pose: CameraPose;
      readonly stop: CameraStop;
    };

export type CameraNavigator = {
  /** The stop the current move is heading for, if one is running. */
  readonly heading: CameraStop | undefined;
  /**
   * Starts a move from `current` to `stop`, replacing any running move. The app state
   * machine picks the stop (task 7), so two quick presses still move two sides.
   */
  goTo(current: CameraPose, stop: CameraStop, reducedMotion: boolean): void;
  /** Moves on by `dtMs`; call once a frame. */
  update(dtMs: number): NavigatorStep;
  /** Drops the running move, for example when the visitor grabs the camera with the mouse. */
  cancel(): void;
};

export function createCameraNavigator(): CameraNavigator {
  let move:
    { tween: PoseTween; stop: CameraStop; elapsedMs: number } | undefined;

  return {
    get heading() {
      return move?.stop;
    },
    goTo(current, stop, reducedMotion) {
      move = {
        tween: planPoseTween(current, stopPose(stop), reducedMotion),
        stop,
        elapsedMs: 0,
      };
    },
    update(dtMs) {
      if (move === undefined) return { kind: "idle" };
      move.elapsedMs += Math.max(0, dtMs);
      const sample = samplePoseTween(move.tween, move.elapsedMs);
      if (!sample.done) return { kind: "moving", pose: sample.pose };
      const { stop } = move;
      move = undefined;
      return { kind: "arrived", pose: sample.pose, stop };
    },
    cancel() {
      move = undefined;
    },
  };
}
