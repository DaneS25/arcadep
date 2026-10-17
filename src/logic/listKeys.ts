/**
 * Moving through the items of a panel's list (the Skills and Projects panels, task 37):
 * which key moves the choice, from where, and to which index. The list stops at both ends
 * rather than wrapping (like the CRT pages): Home and End already jump to the ends, and a
 * choice that stays on the last item tells a keyboard or screen-reader user they reached
 * the end instead of silently starting over.
 */

import {
  listCommandForKey,
  stepPage,
  type PageCommand,
  type PageKeyInput,
} from "./pager";

/** Where focus is when the key is pressed. */
export type ListFocus = {
  /** The index of the list item that has focus, or undefined when focus is elsewhere in the panel. */
  readonly focusedItem: number | undefined;
  /** Focus is in a text field, which keeps its own keys. */
  readonly typing: boolean;
};

/** Keys that move the choice from anywhere in the panel. */
const ANYWHERE: ReadonlySet<string> = new Set([
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

/**
 * The list command for a key press, or undefined when the key isn't the list's. Up, Down,
 * Home and End work wherever focus is in the panel; Left and Right only while an item has
 * focus, so they stay free elsewhere. A text field and modified presses are left alone.
 */
export function listKeyCommand(
  input: PageKeyInput,
  focus: ListFocus,
): PageCommand | undefined {
  if (focus.typing) return undefined;
  const command = listCommandForKey(input);
  if (command === undefined) return undefined;
  if (focus.focusedItem === undefined && !ANYWHERE.has(input.key))
    return undefined;
  return command;
}

/**
 * The item a command leads to. It steps from the focused item when one has focus, else
 * from the chosen one; it stops at both ends (no wrapping) and stays on 0 with no items.
 */
export function listTarget(
  chosen: number,
  count: number,
  command: PageCommand,
  focusedItem?: number,
): number {
  return stepPage(focusedItem ?? chosen, count, command);
}
