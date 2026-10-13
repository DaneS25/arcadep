import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadContent } from "@/content/index";
import type { Contact } from "@/content/types";
import type { AppMode } from "@/logic/appState";
import { TERMINAL_COMMANDS } from "@/logic/terminalCommands";
import {
  NEW_TAB_NOTE,
  PANEL_TITLES,
  TERMINAL_HELP_HINT,
  TERMINAL_WELCOME,
  terminalNotListed,
} from "./copy";
import { createPanelLayer, type PanelLayer } from "./panelLayer";
import {
  MAX_LOG_ENTRIES,
  renderTerminalPanel,
  type TerminalContent,
} from "./terminalPanel";

const PROFILE = { name: "Alex Doe", title: "Developer", tagline: "Hi there." };
const CONTACT: Contact = {
  email: "alex@example.com",
  github: "https://github.com/alex",
  linkedin: null,
  links: [{ label: "Blog", url: "https://example.com/blog/" }],
};
const CONTENT: TerminalContent = { profile: PROFILE, contact: CONTACT };

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement("main");
  document.body.append(root);
});

afterEach(() => {
  root.remove();
});

function mount(content: TerminalContent = CONTENT) {
  const onExit = vi.fn<() => void>();
  const view = renderTerminalPanel(content, document, onExit);
  root.append(...view.body);
  const input = root.querySelector("input");
  const form = root.querySelector("form");
  const log = root.querySelector('[role="log"]');
  if (input === null || form === null || !(log instanceof HTMLElement))
    throw new Error("terminal not built");
  const type = (line: string): void => {
    input.value = line;
    form.dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true }),
    );
  };
  const lastEntry = (): HTMLElement => {
    const entry = log.lastElementChild;
    if (!(entry instanceof HTMLElement)) throw new Error("no entry");
    return entry;
  };
  return { view, onExit, input, form, log, type, lastEntry };
}

function key(target: HTMLElement, name: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

describe("renderTerminalPanel", () => {
  it("is the Contact panel, focuses its labelled input and greets the visitor", () => {
    const { view, input, log } = mount();
    expect(view.title).toBe(PANEL_TITLES.right);
    expect(view.initialFocus).toBe(input);
    expect(input.getAttribute("aria-label")).toBe("Command");
    expect(log.getAttribute("aria-label")).toBe("Terminal output");
    expect(log.textContent).toContain(TERMINAL_WELCOME[0]);
  });

  it("lists every command as a button", () => {
    mount();
    const names = [...root.querySelectorAll("nav button")].map(
      (b) => b.textContent,
    );
    expect(names).toEqual([...TERMINAL_COMMANDS]);
    expect(root.querySelector("nav")?.getAttribute("aria-label")).toBe(
      "Commands",
    );
  });

  it("echoes a typed command, shows its output and clears the input", () => {
    const { type, input, lastEntry } = mount();
    type("  Email ");
    expect(input.value).toBe("");
    const entry = lastEntry();
    expect(entry.querySelector(".terminal__echo")?.textContent).toContain(
      "Email",
    );
    const link = entry.querySelector("a");
    expect(link?.getAttribute("href")).toBe("mailto:alex@example.com");
    expect(link?.textContent).toBe("alex@example.com");
  });

  it("encodes the mailto address so it can't carry extra headers", () => {
    const { type, lastEntry } = mount({
      ...CONTENT,
      contact: { ...CONTACT, email: "a?cc=x@example.com" },
    });
    type("email");
    expect(lastEntry().querySelector("a")?.getAttribute("href")).toBe(
      "mailto:a%3Fcc%3Dx@example.com",
    );
  });

  it("opens profile links in a new tab and says so", () => {
    const { type, lastEntry } = mount();
    type("github");
    const link = lastEntry().querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://github.com/alex");
    expect(link?.target).toBe("_blank");
    expect(link?.rel).toBe("noopener noreferrer");
    expect(link?.textContent).toBe(`github.com/alex ${NEW_TAB_NOTE}`);
  });

  it("says when a field is missing", () => {
    const { type, lastEntry } = mount();
    type("linkedin");
    expect(lastEntry().textContent).toContain(terminalNotListed("LinkedIn"));
  });

  it("drops a non-https link even if it got past validation", () => {
    const { type, lastEntry } = mount({
      ...CONTENT,
      contact: { ...CONTACT, github: "javascript:alert(1)" },
    });
    type("github");
    expect(lastEntry().querySelector("a")).toBeNull();
    expect(lastEntry().textContent).toContain(terminalNotListed("GitHub"));
  });

  it("shows every way to get in touch for contact, extra links too", () => {
    const { type, lastEntry } = mount();
    type("contact");
    const text = lastEntry().textContent;
    expect(text).toContain("alex@example.com");
    expect(text).toContain("github.com/alex");
    expect(text).toContain(terminalNotListed("LinkedIn"));
    expect(text).toContain("Blog: example.com/blog");
  });

  it("answers whoami from the profile, skipping empty fields", () => {
    const { type, lastEntry } = mount({
      ...CONTENT,
      profile: { ...PROFILE, tagline: "" },
    });
    type("whoami");
    const lines = [...lastEntry().querySelectorAll(".terminal__line")].map(
      (p) => p.textContent,
    );
    expect(lines).toEqual(["Alex Doe", "Developer"]);
  });

  it("lists the commands for help, or one for help <command>", () => {
    const { type, lastEntry } = mount();
    type("help");
    expect(lastEntry().querySelectorAll(".terminal__line")).toHaveLength(
      TERMINAL_COMMANDS.length,
    );
    type("help whoami");
    const lines = lastEntry().querySelectorAll(".terminal__line");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.textContent).toMatch(/^whoami/);
  });

  it("reports unknown commands with a hint or a suggestion", () => {
    const { type, lastEntry } = mount();
    type("sudo");
    expect(lastEntry().textContent).toContain("command not found: sudo");
    expect(lastEntry().textContent).toContain(TERMINAL_HELP_HINT);
    type("emial");
    expect(lastEntry().textContent).toContain('Did you mean "email"?');
  });

  it("ignores a blank line and clears the screen on clear", () => {
    const { type, log } = mount();
    const before = log.childElementCount;
    type("   ");
    expect(log.childElementCount).toBe(before);
    type("help");
    type("clear");
    expect(log.childElementCount).toBe(0);
  });

  it("treats markup as text", () => {
    const { type, lastEntry } = mount();
    type("<img src=x onerror=alert(1)>");
    expect(lastEntry().querySelector("img")).toBeNull();
  });

  it("runs a command when its button is clicked", () => {
    const { lastEntry } = mount();
    root.querySelector<HTMLButtonElement>('[data-command="whoami"]')?.click();
    expect(lastEntry().textContent).toContain("Alex Doe");
  });

  it("asks to close on exit, once", () => {
    const { type, onExit } = mount();
    type("exit");
    type("exit");
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("keeps the log to MAX_LOG_ENTRIES", () => {
    const { type, log } = mount();
    for (let i = 0; i < MAX_LOG_ENTRIES + 10; i += 1) type("whoami");
    expect(log.childElementCount).toBe(MAX_LOG_ENTRIES);
  });

  it("steps through earlier commands with ArrowUp and ArrowDown in the input", () => {
    const { view, type, input } = mount();
    type("help");
    type("whoami");
    const send = (name: string): KeyboardEvent => {
      const event = key(input, name);
      view.onKeyDown?.(event);
      return event;
    };
    expect(send("ArrowUp").defaultPrevented).toBe(true);
    expect(input.value).toBe("whoami");
    send("ArrowUp");
    send("ArrowUp");
    expect(input.value).toBe("help");
    send("ArrowDown");
    expect(input.value).toBe("whoami");
    send("ArrowDown");
    expect(input.value).toBe("");
  });

  it("stops listening once disposed", () => {
    const { view, type, onExit, log } = mount();
    view.dispose?.();
    const before = log.childElementCount;
    type("exit");
    expect(onExit).not.toHaveBeenCalled();
    expect(log.childElementCount).toBe(before);
  });

  it("renders the real content", () => {
    const content = loadContent(() => undefined);
    const { type, lastEntry } = mount({
      profile: content.profile,
      contact: content.contact,
    });
    type("contact");
    expect(lastEntry().querySelectorAll("a").length).toBeGreaterThan(0);
  });
});

describe("terminal in the panel layer", () => {
  let layer: PanelLayer | undefined;
  afterEach(() => {
    layer?.dispose();
    layer = undefined;
  });

  it("focuses the input on open, closes on exit and returns focus", () => {
    const opener = document.createElement("button");
    root.append(opener);
    opener.focus();
    const closed: AppMode = { kind: "focused", side: "right" };
    // The state machine's part: a close request syncs the layer to the closed state.
    const onCloseRequest = vi.fn(() => {
      layer?.sync(closed);
    });
    const created = createPanelLayer({
      parent: root,
      onCloseRequest,
      fallbackFocus: () => undefined,
      render: (_side, doc) => renderTerminalPanel(CONTENT, doc, onCloseRequest),
    });
    layer = created;
    created.sync({ kind: "panel", side: "right" });

    const input = created.element.querySelector("input");
    expect(document.activeElement).toBe(input);
    expect(created.element.dataset.side).toBe("right");

    if (input === null) throw new Error("no input");
    input.value = "exit";
    input.form?.dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true }),
    );
    expect(onCloseRequest).toHaveBeenCalledTimes(1);
    expect(created.element.open).toBe(false);
    expect(document.activeElement).toBe(opener);
  });
});
