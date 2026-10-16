/**
 * UI copy: labels and hints for the overlays and the scene. Site content (what the
 * visitor reads about the owner) lives in `src/content/`, not here.
 */

import type { Side } from "@/logic/buildingLayout";
import type { TerminalCommand } from "@/logic/terminalCommands";

/** Accessible name of the scene canvas (it gets focus back when a panel closes). */
export const SCENE_LABEL =
  "Arcade building. Arrow keys or Tab pick a side, Enter opens it, Escape closes it.";

/** Panel heading per side. */
export const PANEL_TITLES: Readonly<Record<Side, string>> = {
  front: "About",
  left: "Skills",
  back: "Projects",
  right: "Contact",
};

/** Shown until the side's task (10 to 13) fills its panel from `src/content/`. */
export const PANEL_PLACEHOLDER =
  "Nothing here yet. This panel is being wired up.";

export const CLOSE_LABEL = "Close";
/** Key hint shown on the close button (hidden from screen readers). */
export const CLOSE_HINT = "Esc";

/** The cabinet's attract-mode prompt, blinking on its screen. */
export const PRESS_START = "PRESS START";
/** Lit sign across the top of the cabinet. */
export const CABINET_MARQUEE = "ABOUT ME";
/** Small line under the prompt on the cabinet's screen. */
export const CABINET_CREDIT = "CREDIT 01";

/** The exit sign over the back's left-hand door (task 34). */
export const EXIT_SIGN = "EXIT";

/** The CRT panel's page buttons and their group. */
export const CRT_PAGES_LABEL = "About pages";
export const CRT_PREVIOUS = "Previous";
export const CRT_NEXT = "Next";
/** Page counter, e.g. "PAGE 1 / 3". */
export function crtPageCounter(page: number, total: number): string {
  return `PAGE ${String(page)} / ${String(total)}`;
}
/** Key hint under the CRT pages (hidden from screen readers; the buttons say the same). */
export const CRT_KEY_HINT = "\u2190 \u2192 change page";

/** The Skills panel's list of skills (left side). */
export const SKILLS_LIST_LABEL = "Skills";
/** A skill's level, e.g. "Level 4 of 5". */
export function skillLevelText(level: number, max: number): string {
  return `Level ${String(level)} of ${String(max)}`;
}
/** Years of use, e.g. "3 years" or "1 year". */
export function skillYearsText(years: number): string {
  return `${String(years)} ${years === 1 ? "year" : "years"}`;
}
/** Labels of the skill's facts. */
export const SKILL_LEVEL_LABEL = "Level";
export const SKILL_YEARS_LABEL = "Experience";
/** Key hint under the skill list (hidden from screen readers; the buttons say the same). */
export const SKILLS_KEY_HINT = "↑ ↓ choose a skill";

/** The Projects panel's list of projects (back side). */
export const PROJECTS_LIST_LABEL = "Projects";
/** Key hint under the project list (hidden from screen readers; the buttons say the same). */
export const PROJECTS_KEY_HINT = "↑ ↓ choose a project";
/** Label of a project's tag list. */
export const PROJECT_TAGS_LABEL = "Tags";
/** The link to the hosted project. */
export const PROJECT_LINK_LABEL = "Open project";
/** Said after the link text, so screen reader users know a tab will open. */
export const NEW_TAB_NOTE = "(opens in a new tab)";
/** Alt text of a project's screenshot. */
export function projectThumbnailAlt(title: string): string {
  return `Screenshot of ${title}`;
}

/** The door terminal's screen in the scene (right side). */
export const TERMINAL_SCREEN_PROMPT = "> JACK IN_";
export const TERMINAL_SCREEN_LABEL = "CONTACT";
/** The terminal panel: prompt sign, input label and the command list. */
export const TERMINAL_PROMPT = "guest@arcade:~$";
export const TERMINAL_INPUT_LABEL = "Command";
export const TERMINAL_OUTPUT_LABEL = "Terminal output";
export const TERMINAL_COMMANDS_LABEL = "Commands";
/** Shown when the terminal opens. */
export const TERMINAL_WELCOME: readonly string[] = [
  "Jacked in. Connection secure.",
  "Type a command and press Enter, or pick one below. Type help for the list.",
];
/** What each command does, for `help`. */
export const TERMINAL_COMMAND_HELP: Readonly<Record<TerminalCommand, string>> =
  {
    help: "list the commands, or explain one: help email",
    contact: "every way to reach me",
    email: "my email address",
    github: "my GitHub profile",
    linkedin: "my LinkedIn profile",
    whoami: "who runs this building",
    clear: "clear the screen",
    exit: "leave the terminal (or press Escape)",
  };
/** Labels of the contact lines. */
export const TERMINAL_FIELD_LABELS = {
  email: "Email",
  github: "GitHub",
  linkedin: "LinkedIn",
} as const;
/** A contact field that is missing or failed validation. */
export function terminalNotListed(label: string): string {
  return `${label}: not listed`;
}
export function terminalNotFound(name: string): string {
  return `command not found: ${name}`;
}
export function terminalSuggestion(command: string): string {
  return `Did you mean "${command}"?`;
}
export const TERMINAL_HELP_HINT = "Type help for the list of commands.";
export function terminalBadArgs(command: string): string {
  return command === "help"
    ? "help: give one command at most, like help email"
    : `${command}: takes no arguments`;
}
