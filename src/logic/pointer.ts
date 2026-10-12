/** Pointer maths for picking, kept free of the DOM so it can be tested. */

export type ScreenPoint = { readonly x: number; readonly y: number };

export type ScreenRect = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

/** A press that moves further than this (in CSS pixels) is a drag, not a click. */
export const CLICK_SLOP_PX = 5;

/**
 * Normalised device coordinates for a pointer position over `rect`: x and y run from -1
 * to 1, with y up. Undefined for an empty rect.
 */
export function toNdc(
  point: ScreenPoint,
  rect: ScreenRect,
): ScreenPoint | undefined {
  if (rect.width <= 0 || rect.height <= 0) return undefined;
  return {
    x: ((point.x - rect.left) / rect.width) * 2 - 1,
    y: -(((point.y - rect.top) / rect.height) * 2 - 1),
  };
}

/** True when a press and release are close enough together to count as a click. */
export function isClick(down: ScreenPoint, up: ScreenPoint): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= CLICK_SLOP_PX;
}
