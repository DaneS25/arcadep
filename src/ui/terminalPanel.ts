import "./terminalPanel.css";
import type { Contact, Profile } from "@/content/types";
import { isHttpsUrl } from "@/content/validate";
import {
  displayUrl,
  historyStep,
  MAX_INPUT_LENGTH,
  parseCommand,
  TERMINAL_COMMANDS,
  type ParsedCommand,
  type TerminalCommand,
} from "@/logic/terminalCommands";
import {
  NEW_TAB_NOTE,
  PANEL_TITLES,
  TERMINAL_COMMAND_HELP,
  TERMINAL_COMMANDS_LABEL,
  TERMINAL_FIELD_LABELS,
  TERMINAL_HELP_HINT,
  TERMINAL_INPUT_LABEL,
  TERMINAL_OUTPUT_LABEL,
  TERMINAL_PROMPT,
  TERMINAL_WELCOME,
  terminalBadArgs,
  terminalNotFound,
  terminalNotListed,
  terminalSuggestion,
} from "./copy";
import type { PanelView } from "./panelLayer";

/** What the terminal can tell the visitor (from `src/content/`). */
export type TerminalContent = {
  readonly profile: Pick<Profile, "name" | "title" | "tagline">;
  readonly contact: Contact;
};

export const TERMINAL_INPUT_ID = "terminal-input";
/** Oldest entries are dropped past this, so a long session can't grow the page forever. */
export const MAX_LOG_ENTRIES = 50;
/** Commands kept for ArrowUp and ArrowDown. */
export const MAX_HISTORY = 50;

/** One line of output: plain text, or text and nodes (links) in a row. */
type Line = string | readonly (string | Node)[];

/** A link that opens in a new tab and says so to screen readers; `null` if not `https:`. */
function externalLink(doc: Document, url: string): HTMLAnchorElement | null {
  // Validation already drops non-https links; this keeps the terminal safe on its own.
  if (!isHttpsUrl(url)) return null;
  const link = doc.createElement("a");
  link.className = "terminal__link";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  const note = doc.createElement("span");
  note.className = "visually-hidden";
  note.textContent = ` ${NEW_TAB_NOTE}`;
  link.append(displayUrl(url), note);
  return link;
}

/** A `mailto:` link; the address parts are encoded so `?` or `&` can't add headers. */
function emailLink(doc: Document, email: string): HTMLAnchorElement {
  const at = email.lastIndexOf("@");
  const link = doc.createElement("a");
  link.className = "terminal__link";
  link.href = `mailto:${encodeURIComponent(email.slice(0, at))}@${encodeURIComponent(email.slice(at + 1))}`;
  link.textContent = email;
  return link;
}

function emailLine(doc: Document, email: string | null): Line {
  const label = TERMINAL_FIELD_LABELS.email;
  return email === null
    ? terminalNotListed(label)
    : [`${label}: `, emailLink(doc, email)];
}

function urlLine(doc: Document, label: string, url: string | null): Line {
  const link = url === null ? null : externalLink(doc, url);
  return link === null ? terminalNotListed(label) : [`${label}: `, link];
}

function helpLines(topic: TerminalCommand | null): Line[] {
  const commands = topic === null ? TERMINAL_COMMANDS : [topic];
  return commands.map(
    (command) => `${command.padEnd(9)}${TERMINAL_COMMAND_HELP[command]}`,
  );
}

/** The output lines for a parsed line; none for commands that act instead (clear, exit). */
export function outputFor(
  parsed: ParsedCommand,
  content: TerminalContent,
  doc: Document,
): Line[] {
  const { contact, profile } = content;
  switch (parsed.kind) {
    case "empty":
      return [];
    case "badArgs":
      return [terminalBadArgs(parsed.command)];
    case "unknown":
      return [
        terminalNotFound(parsed.name),
        parsed.suggestion === null
          ? TERMINAL_HELP_HINT
          : terminalSuggestion(parsed.suggestion),
      ];
    case "command":
      break;
  }
  switch (parsed.command) {
    case "help":
      return helpLines(parsed.topic);
    case "email":
      return [emailLine(doc, contact.email)];
    case "github":
      return [urlLine(doc, TERMINAL_FIELD_LABELS.github, contact.github)];
    case "linkedin":
      return [urlLine(doc, TERMINAL_FIELD_LABELS.linkedin, contact.linkedin)];
    case "contact":
      return [
        emailLine(doc, contact.email),
        urlLine(doc, TERMINAL_FIELD_LABELS.github, contact.github),
        urlLine(doc, TERMINAL_FIELD_LABELS.linkedin, contact.linkedin),
        ...contact.links.map((link) => urlLine(doc, link.label, link.url)),
      ];
    case "whoami":
      return [profile.name, profile.title, profile.tagline].filter(
        (line) => line.length > 0,
      );
    case "clear":
    case "exit":
      return [];
  }
}

/**
 * The right side's door terminal, shown in the panel layer's centred dialog: an output log, a
 * prompt with a text input (focused on open), and every command as a button. Typing a
 * command or clicking one runs it; `exit` asks to close through `onExit`, as Escape does.
 * ArrowUp and ArrowDown in the input step through earlier commands. Contact details are
 * real text and links from `src/content/`.
 */
export function renderTerminalPanel(
  content: TerminalContent,
  doc: Document,
  onExit: () => void,
): PanelView {
  const root = doc.createElement("div");
  root.className = "terminal";

  const log = doc.createElement("div");
  log.className = "terminal__log";
  // role=log is polite and reads only what is added, so each command's output is announced.
  log.setAttribute("role", "log");
  log.setAttribute("aria-label", TERMINAL_OUTPUT_LABEL);

  const form = doc.createElement("form");
  form.className = "terminal__prompt";
  const sign = doc.createElement("span");
  sign.className = "terminal__sign";
  sign.setAttribute("aria-hidden", "true");
  sign.textContent = TERMINAL_PROMPT;
  const input = doc.createElement("input");
  input.className = "terminal__input";
  input.id = TERMINAL_INPUT_ID;
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.maxLength = MAX_INPUT_LENGTH;
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("aria-label", TERMINAL_INPUT_LABEL);
  form.append(sign, input);

  const nav = doc.createElement("nav");
  nav.className = "terminal__commands";
  nav.setAttribute("aria-label", TERMINAL_COMMANDS_LABEL);
  const list = doc.createElement("ul");
  const buttons = TERMINAL_COMMANDS.map((command) => {
    const item = doc.createElement("li");
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "terminal__command";
    button.dataset.command = command;
    button.textContent = command;
    button.title = TERMINAL_COMMAND_HELP[command];
    item.append(button);
    list.append(item);
    return button;
  });
  nav.append(list);
  root.append(log, form, nav);

  const history: string[] = [];
  let historyIndex = 0;
  let closed = false;

  const addEntry = (echo: string | null, lines: readonly Line[]): void => {
    const entry = doc.createElement("div");
    entry.className = "terminal__entry";
    if (echo !== null) {
      const line = doc.createElement("p");
      line.className = "terminal__echo";
      const prompt = doc.createElement("span");
      prompt.className = "terminal__sign";
      prompt.setAttribute("aria-hidden", "true");
      prompt.textContent = `${TERMINAL_PROMPT} `;
      line.append(prompt, echo);
      entry.append(line);
    }
    for (const item of lines) {
      const line = doc.createElement("p");
      line.className = "terminal__line";
      if (typeof item === "string") line.textContent = item;
      else line.append(...item);
      entry.append(line);
    }
    log.append(entry);
    while (log.childElementCount > MAX_LOG_ENTRIES)
      log.firstElementChild?.remove();
    log.scrollTop = log.scrollHeight;
  };

  const run = (raw: string): void => {
    if (closed) return;
    const parsed = parseCommand(raw);
    // A blank Enter does nothing (it also swallows the Enter that opened the terminal).
    if (parsed.kind === "empty") return;
    const echo = raw.trim().slice(0, MAX_INPUT_LENGTH);
    if (history.at(-1) !== echo) history.push(echo);
    if (history.length > MAX_HISTORY) history.shift();
    historyIndex = history.length;

    if (parsed.kind === "command" && parsed.command === "clear") {
      log.replaceChildren();
      return;
    }
    addEntry(echo, outputFor(parsed, content, doc));
    if (parsed.kind === "command" && parsed.command === "exit") {
      closed = true;
      onExit();
    }
  };

  const onSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    const value = input.value;
    input.value = "";
    run(value);
  };

  const onCommandClick = (event: Event): void => {
    const button = buttons.find((b) => b === event.currentTarget);
    const command = button?.dataset.command;
    if (command !== undefined) run(command);
  };

  form.addEventListener("submit", onSubmit);
  for (const button of buttons)
    button.addEventListener("click", onCommandClick);

  addEntry(null, TERMINAL_WELCOME);

  return {
    title: PANEL_TITLES.right,
    body: [root],
    initialFocus: input,
    onKeyDown(event) {
      if (event.target !== input) return;
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;
      event.preventDefault();
      historyIndex = historyStep(
        historyIndex,
        history.length,
        event.key === "ArrowUp" ? -1 : 1,
      );
      input.value = history[historyIndex] ?? "";
    },
    dispose() {
      closed = true;
      form.removeEventListener("submit", onSubmit);
      for (const button of buttons)
        button.removeEventListener("click", onCommandClick);
    },
  };
}
