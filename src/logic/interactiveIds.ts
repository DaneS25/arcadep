/**
 * Ids that scene objects register for picking. The logic layer decides what an id does;
 * scene code only reports which id was hit.
 */

import { SIDES, type Side } from "./buildingLayout";

/** One interaction spot per side. The side tasks keep these ids for their real props. */
export type InteractiveId = `spot-${Side}`;

export function spotId(side: Side): InteractiveId {
  return `spot-${side}`;
}

/** The side an id belongs to. */
export function sideOfId(id: InteractiveId): Side {
  // Every id is built from a side, so the fallback is never reached.
  return SIDES.find((side) => spotId(side) === id) ?? "front";
}
