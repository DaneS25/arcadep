/**
 * Where Tab should go inside a focus trap (an open overlay panel). Pure: the UI passes
 * the index of the focused element among the panel's focusable elements.
 */

export type TrapMove =
  /** Leave it to the browser: focus moves to the next element inside the panel. */
  | { readonly kind: "native" }
  /** Nothing to focus: keep focus where it is. */
  | { readonly kind: "stay" }
  /** Wrap round (or come back inside): focus the element at `index`. */
  | { readonly kind: "move"; readonly index: number };

/**
 * @param current index of the focused element among `count` focusables, or -1 when
 *   focus is on none of them (for example on the panel itself).
 * @param backwards true for Shift+Tab.
 */
export function trapMove(
  current: number,
  count: number,
  backwards: boolean,
): TrapMove {
  if (count <= 0) return { kind: "stay" };
  const last = count - 1;
  if (current < 0 || current > last) {
    return { kind: "move", index: backwards ? last : 0 };
  }
  if (backwards && current === 0) return { kind: "move", index: last };
  if (!backwards && current === last) return { kind: "move", index: 0 };
  return { kind: "native" };
}
