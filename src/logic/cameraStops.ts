/**
 * Where the camera can be sent: a side's view of the building, or a close-up of a side's
 * prop (the cabinet's screen, task 10; the neon signs and the posters, task 14). Also
 * decides, from a change of app mode, where the camera should go. The right side has no
 * close-up: its terminal goes full screen.
 */

import type { AppMode } from "./appState";
import type { Side } from "./buildingLayout";
import { CABINET_SIDE, screenViewPose } from "./cabinetLayout";
import { sidePose, type CameraPose } from "./cameraOrbit";
import { GRAFFITI_SIDE, postersViewPose } from "./graffitiLayout";
import { SIGNS_SIDE, signsViewPose } from "./skillSignsLayout";

export type CameraStop =
  | { readonly kind: "side"; readonly side: Side }
  | { readonly kind: "closeUp"; readonly side: Side };

/** Sides whose open panel brings the camera in close, with the pose each one uses. */
const CLOSE_UP_POSES: ReadonlyMap<Side, () => CameraPose> = new Map([
  [CABINET_SIDE, () => screenViewPose()],
  [SIGNS_SIDE, () => signsViewPose()],
  [GRAFFITI_SIDE, () => postersViewPose()],
]);

/** Sides whose open panel brings the camera in close: the cabinet, the signs and the posters. */
export const CLOSE_UP_SIDES: readonly Side[] = [...CLOSE_UP_POSES.keys()];

/** The camera pose for a stop; a close-up of a side without one is that side's view. */
export function stopPose(stop: CameraStop): CameraPose {
  const closeUp =
    stop.kind === "closeUp" ? CLOSE_UP_POSES.get(stop.side) : undefined;
  return closeUp === undefined ? sidePose(stop.side) : closeUp();
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
