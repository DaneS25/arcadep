/**
 * Keyboard commands for moving round the building and opening and closing a side: a small
 * table from key to command. The app state machine decides what each command does.
 */

import type { AppEvent, CycleDirection } from "./appState";
import type { Side } from "./buildingLayout";
import type { TurnDirection } from "./cameraOrbit";

export type NavCommand =
  | { readonly kind: "turn"; readonly direction: TurnDirection }
  | { readonly kind: "cycle"; readonly direction: CycleDirection }
  | { readonly kind: "open" }
  | { readonly kind: "close" };

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
  Tab: { kind: "cycle", direction: "next" },
  Enter: { kind: "open" },
  Escape: { kind: "close" },
};

const SHIFT_COMMANDS: Readonly<Record<string, NavCommand>> = {
  Tab: { kind: "cycle", direction: "previous" },
};

/**
 * The command for a key press, or undefined when the key isn't ours. Presses with a
 * modifier are left to the browser (for example Alt+Left goes back); Shift only counts
 * with Tab.
 */
export function navCommandForKey(input: KeyInput): NavCommand | undefined {
  if (input.altKey || input.ctrlKey || input.metaKey) return undefined;
  const table = input.shiftKey ? SHIFT_COMMANDS : KEY_COMMANDS;
  return table[input.key];
}

/** The state machine event for a command; `nearest` is the side the camera faces most. */
export function eventForCommand(command: NavCommand, nearest: Side): AppEvent {
  return command.kind === "turn" ? { ...command, nearest } : command;
}
