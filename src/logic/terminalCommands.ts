/**
 * The door terminal's command parser (right side, task 13). Pure: it turns a typed line
 * into a parsed command and leaves the wording and the contact data to the UI.
 */

/** The terminal's commands, in the order the clickable list shows them. */
export const TERMINAL_COMMANDS = [
  "help",
  "contact",
  "email",
  "phone",
  "github",
  "linkedin",
  "whoami",
  "clear",
  "exit",
] as const;

export type TerminalCommand = (typeof TERMINAL_COMMANDS)[number];

/** Other names a visitor might try, mapped to a command. */
export const TERMINAL_ALIASES: Readonly<Record<string, TerminalCommand>> = {
  "?": "help",
  man: "help",
  commands: "help",
  mail: "email",
  tel: "phone",
  call: "phone",
  gh: "github",
  li: "linkedin",
  cls: "clear",
  quit: "exit",
  logout: "exit",
};

/** Longest line the terminal reads; the rest is dropped. */
export const MAX_INPUT_LENGTH = 80;
/** Longest unknown name echoed back, so a long paste can't flood the output. */
export const MAX_ECHO_LENGTH = 24;
/** Farthest typo (edit distance) that still gets a "did you mean". */
export const MAX_SUGGESTION_DISTANCE = 2;

export type ParsedCommand =
  /** Nothing but spaces (or a bare prompt sign). */
  | { readonly kind: "empty" }
  /** A known command; `topic` is set only for `help <command>`. */
  | {
      readonly kind: "command";
      readonly command: TerminalCommand;
      readonly topic: TerminalCommand | null;
    }
  /** A known command with arguments it doesn't take. */
  | { readonly kind: "badArgs"; readonly command: TerminalCommand }
  /** Not a command (or `help` about something that isn't one). */
  | {
      readonly kind: "unknown";
      /** The name as typed, lower case, cut to `MAX_ECHO_LENGTH`. */
      readonly name: string;
      readonly suggestion: TerminalCommand | null;
    };

/** Control characters (tabs, newlines from a paste, escapes) count as spaces. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
/** A prompt sign pasted along with a command, as in "$ help". */
const PROMPT_SIGN = /^[$>#]\s*/;

/** The command a name stands for (its own name or an alias), if any. */
export function lookupCommand(name: string): TerminalCommand | undefined {
  const lower = name.toLowerCase();
  const direct = TERMINAL_COMMANDS.find((command) => command === lower);
  if (direct !== undefined) return direct;
  return Object.hasOwn(TERMINAL_ALIASES, lower)
    ? TERMINAL_ALIASES[lower]
    : undefined;
}

/** Levenshtein distance between two strings. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/** The nearest command to a mistyped name, within `MAX_SUGGESTION_DISTANCE`; ties go to the list order. */
export function suggestCommand(name: string): TerminalCommand | null {
  let best: TerminalCommand | null = null;
  let bestDistance = MAX_SUGGESTION_DISTANCE + 1;
  for (const command of TERMINAL_COMMANDS) {
    const distance = editDistance(name.toLowerCase(), command);
    // A one-letter guess is too vague to correct ("x" is close to nothing useful).
    if (distance < bestDistance && distance < command.length - 1) {
      best = command;
      bestDistance = distance;
    }
  }
  return best;
}

function unknown(name: string): ParsedCommand {
  const lower = name.toLowerCase();
  const echoed =
    lower.length > MAX_ECHO_LENGTH
      ? `${lower.slice(0, MAX_ECHO_LENGTH - 1)}…`
      : lower;
  return { kind: "unknown", name: echoed, suggestion: suggestCommand(lower) };
}

/**
 * Parses one typed line: case and extra spaces don't matter, a leading prompt sign is
 * ignored, and only `help` takes an argument (the command to explain).
 */
export function parseCommand(input: string): ParsedCommand {
  const words = input
    .slice(0, MAX_INPUT_LENGTH)
    .replace(CONTROL, " ")
    .trim()
    .replace(PROMPT_SIGN, "")
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const [name, ...args] = words;
  if (name === undefined) return { kind: "empty" };

  const command = lookupCommand(name);
  if (command === undefined) return unknown(name);
  if (args.length === 0) return { kind: "command", command, topic: null };
  if (command !== "help" || args.length > 1)
    return { kind: "badArgs", command };

  const [topicName] = args;
  if (topicName === undefined) return { kind: "command", command, topic: null };
  const topic = lookupCommand(topicName);
  return topic === undefined
    ? unknown(topicName)
    : { kind: "command", command, topic };
}

/**
 * Moves through earlier commands: `-1` goes back (ArrowUp), `+1` forward (ArrowDown).
 * Index `length` is the fresh line after the newest entry.
 */
export function historyStep(
  index: number,
  length: number,
  direction: -1 | 1,
): number {
  return Math.min(length, Math.max(0, index + direction));
}

/** A link's address without the scheme or a trailing slash, for showing as its text. */
export function displayUrl(url: string): string {
  return url.replace(/^https:\/\//i, "").replace(/\/$/, "");
}
