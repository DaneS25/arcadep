/**
 * Paging through a short list (the CRT panel's about pages, task 10): which page a key or
 * button leads to. Pages stop at both ends rather than wrapping, so "next" on the last page
 * stays put.
 */

export type PageCommand = "next" | "previous" | "first" | "last";

const KEY_COMMANDS: Readonly<Record<string, PageCommand>> = {
  ArrowRight: "next",
  ArrowLeft: "previous",
  PageDown: "next",
  PageUp: "previous",
  Home: "first",
  End: "last",
};

/** The parts of a keyboard event the mapping looks at. */
export type PageKeyInput = {
  readonly key: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
};

/** The page command for a key press, or undefined; presses with a modifier are left alone. */
export function pageCommandForKey(
  input: PageKeyInput,
): PageCommand | undefined {
  if (input.altKey || input.ctrlKey || input.metaKey || input.shiftKey)
    return undefined;
  return KEY_COMMANDS[input.key];
}

/** A page index kept inside `[0, count - 1]` (0 when there are no pages). */
export function clampPage(index: number, count: number): number {
  if (count <= 0 || !Number.isFinite(index)) return 0;
  return Math.min(count - 1, Math.max(0, Math.trunc(index)));
}

/** The page a command leads to from `index`. */
export function stepPage(
  index: number,
  count: number,
  command: PageCommand,
): number {
  switch (command) {
    case "next":
      return clampPage(index + 1, count);
    case "previous":
      return clampPage(index - 1, count);
    case "first":
      return 0;
    case "last":
      return clampPage(count - 1, count);
  }
}

/** Whether a command would leave the page where it is (the button for it is shown as unavailable). */
export function isAtLimit(
  index: number,
  count: number,
  command: PageCommand,
): boolean {
  return stepPage(index, count, command) === clampPage(index, count);
}

const LIST_KEY_COMMANDS: Readonly<Record<string, PageCommand>> = {
  ArrowDown: "next",
  ArrowRight: "next",
  ArrowUp: "previous",
  ArrowLeft: "previous",
  Home: "first",
  End: "last",
};

/**
 * The command for a key press in a list of choices (the Skills panel, task 11): the arrow
 * keys in either direction, Home and End. Presses with a modifier are left alone.
 */
export function listCommandForKey(
  input: PageKeyInput,
): PageCommand | undefined {
  if (input.altKey || input.ctrlKey || input.metaKey || input.shiftKey)
    return undefined;
  return LIST_KEY_COMMANDS[input.key];
}
