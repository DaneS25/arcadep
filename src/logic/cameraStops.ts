/**
 * Where the camera can be sent: a side's view of the building, or a close-up of a side's
 * prop (the cabinet's screen, task 10). Also decides, from a change of app mode, where the
 * camera should go.
 */

import type { AppMode } from "./appState";
import type { Side } from "./buildingLayout";
import { CABINET_SIDE, screenViewPose } from "./cabinetLayout";
import { sidePose, type CameraPose } from "./cameraOrbit";

export type CameraStop =
  | { readonly kind: "side"; readonly side: Side }
  | { readonly kind: "closeUp"; readonly side: Side };

/** Sides whose open panel brings the camera in close: the cabinet's screen. */
export const CLOSE_UP_SIDES: readonly Side[] = [CABINET_SIDE];

/** The camera pose for a stop. */
export function stopPose(stop: CameraStop): CameraPose {
  return stop.kind === "closeUp" ? screenViewPose() : sidePose(stop.side);
}

/** The side whose close-up a mode shows, if any: an open panel on a close-up side. */
export function closeUpSide(mode: AppMode): Side | undefined {
  return mode.kind === "panel" && CLOSE_UP_SIDES.includes(mode.side)
    ? mode.side
    : undefined;
}

/**
 * Where the camera goes after the mode changes from `previous` to `next`, given the side
 * the state machine asked to snap to (if any). Opening a close-up side's panel moves in
 * to its prop; leaving it backs out to that side's view (or the side asked for).
 */
export function cameraCue(
  previous: AppMode,
  next: AppMode,
  snapTo: Side | undefined,
): CameraStop | undefined {
  const wasClose = closeUpSide(previous);
  const isClose = closeUpSide(next);
  if (isClose !== undefined) {
    return isClose === wasClose
      ? undefined
      : { kind: "closeUp", side: isClose };
  }
  if (wasClose !== undefined) {
    const side = snapTo ?? (next.kind === "exploring" ? wasClose : next.side);
    return { kind: "side", side };
  }
  return snapTo === undefined ? undefined : { kind: "side", side: snapTo };
}
