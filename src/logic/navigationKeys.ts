/**
 * Keyboard commands for moving round the building. Kept as a small table from key to
 * command so task 7 can add its own keys (Tab, Enter, Escape) next to these.
 */

import type { TurnDirection } from "./cameraOrbit";

export type NavCommand = {
  readonly kind: "turn";
  readonly direction: TurnDirection;
};

/** The parts of a keyboard event the mapping looks at. */
export type KeyInput = {
  readonly key: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
};

const KEY_COMMANDS: Readonly<Record<string, NavCommand>> = {
  ArrowLeft: { kind: "turn", direction: "left" },
  ArrowRight: { kind: "turn", direction: "right" },
};

/**
 * The command for a key press, or undefined when the key isn't ours. Presses with a
 * modifier are left to the browser (for example Alt+Left goes back).
 */
export function navCommandForKey(input: KeyInput): NavCommand | undefined {
  if (input.altKey || input.ctrlKey || input.metaKey || input.shiftKey) {
    return undefined;
  }
  return KEY_COMMANDS[input.key];
}
