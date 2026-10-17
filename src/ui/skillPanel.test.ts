import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadContent } from "@/content/index";
import type { Skill } from "@/content/types";
import type { AppMode } from "@/logic/appState";
import { PANEL_PLACEHOLDER, PANEL_TITLES } from "./copy";
import {
  createPanelLayer,
  placeholderPanel,
  type PanelLayer,
} from "./panelLayer";
import { renderSkillPanel } from "./skillPanel";

const SKILLS: readonly Skill[] = [
  { id: "a", name: "Alpha", group: "G1", level: 2, years: 1, note: "First." },
  { id: "b", name: "Beta", group: "G1", level: 5, years: 6, note: "Second." },
  { id: "c", name: "Gamma", group: "G2", level: 3, years: 2, note: "Third." },
];

const LEFT_PANEL: AppMode = { kind: "panel", side: "left" };
const LEFT_FOCUSED: AppMode = { kind: "focused", side: "left" };

let root: HTMLElement;
let canvas: HTMLCanvasElement;
let layer: PanelLayer | undefined;

function open(skills: readonly Skill[] = SKILLS) {
  const created = createPanelLayer({
    parent: root,
    onCloseRequest: vi.fn<() => void>(),
    fallbackFocus: () => canvas,
    render: (side, doc) =>
      side === "left"
        ? renderSkillPanel(skills, doc)
        : placeholderPanel(side, doc),
  });
  layer = created;
  created.sync(LEFT_PANEL);
  return { dialog: created.element, layer: created };
}

function heading(dialog: HTMLElement): string | null | undefined {
  return dialog.querySelector("h3")?.textContent;
}

function skillButton(dialog: HTMLElement, id: string): HTMLButtonElement {
  const found = dialog.querySelector<HTMLButtonElement>(
    `button[data-skill="${id}"]`,
  );
  if (found === null) throw new Error(`no button for ${id}`);
  return found;
}

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
}

beforeEach(() => {
  root = document.createElement("main");
  canvas = document.createElement("canvas");
  canvas.tabIndex = -1;
  root.append(canvas);
  document.body.append(root);
  canvas.focus();
});

afterEach(() => {
  layer?.dispose();
  layer = undefined;
  root.remove();
});

describe("renderSkillPanel", () => {
  it("lists every skill and shows the first one's details as real text", () => {
    const { dialog } = open();
    expect(dialog.querySelector("h2")?.textContent).toBe(PANEL_TITLES.left);
    expect(dialog.querySelectorAll(".skills__item")).toHaveLength(3);
    expect(heading(dialog)).toBe("Alpha");
    const detail = dialog.querySelector(".skills__detail");
    expect(detail?.textContent).toContain("Level 2 of 5");
    expect(detail?.textContent).toContain("1 year");
    expect(detail?.textContent).toContain("First.");
    expect(detail?.getAttribute("aria-live")).toBe("polite");
    expect(skillButton(dialog, "a").getAttribute("aria-current")).toBe("true");
  });

  it("shows the skills from src/content", () => {
    const { skills } = loadContent(() => undefined);
    const view = renderSkillPanel(skills, document);
    const [rootNode] = view.body;
    if (!(rootNode instanceof HTMLElement)) throw new Error("no root");
    expect(rootNode.querySelector("h3")?.textContent).toBe(skills[0]?.name);
    expect(rootNode.querySelectorAll(".skills__item")).toHaveLength(
      skills.length,
    );
    view.dispose?.();
  });

  it("shows a skill's details when its button is clicked", () => {
    const { dialog } = open();
    skillButton(dialog, "b").click();
    expect(heading(dialog)).toBe("Beta");
    expect(dialog.querySelector(".skills__detail")?.textContent).toContain(
      "6 years",
    );
    expect(dialog.querySelectorAll(".skills__pip--on")).toHaveLength(5);
    expect(skillButton(dialog, "b").getAttribute("aria-current")).toBe("true");
    expect(skillButton(dialog, "a").hasAttribute("aria-current")).toBe(false);
  });

  it("moves between skills with the arrow keys, Home and End while a skill has focus", () => {
    const { dialog } = open();
    skillButton(dialog, "a").focus();

    const down = press("ArrowDown");
    expect(down.defaultPrevented).toBe(true);
    expect(heading(dialog)).toBe("Beta");
    expect(document.activeElement).toBe(skillButton(dialog, "b"));

    press("End");
    expect(heading(dialog)).toBe("Gamma");
    press("ArrowRight");
    expect(heading(dialog)).toBe("Gamma");
    press("ArrowUp");
    expect(heading(dialog)).toBe("Beta");
    press("Home");
    expect(heading(dialog)).toBe("Alpha");
    expect(document.activeElement).toBe(skillButton(dialog, "a"));
  });

  it("moves through the skills with Up, Down, Home and End from anywhere in the panel", () => {
    const { dialog } = open();
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    const close = dialog.querySelector<HTMLButtonElement>(".panel__close");
    // Focus starts on the close button, not on a skill.
    expect(document.activeElement).toBe(close);

    const down = press("ArrowDown");
    expect(down.defaultPrevented).toBe(true);
    expect(heading(dialog)).toBe("Beta");
    expect(document.activeElement).toBe(skillButton(dialog, "b"));
    expect(scroll.mock.contexts.at(-1)).toBe(skillButton(dialog, "b"));
    expect(scroll).toHaveBeenLastCalledWith({ block: "nearest" });

    close?.focus();
    press("End");
    expect(heading(dialog)).toBe("Gamma");
    expect(document.activeElement).toBe(skillButton(dialog, "c"));
    close?.focus();
    // It stops at the end rather than wrapping.
    press("ArrowDown");
    expect(heading(dialog)).toBe("Gamma");
    close?.focus();
    press("ArrowUp");
    expect(heading(dialog)).toBe("Beta");
    // The detail card counts as inside the panel too.
    dialog.querySelector<HTMLElement>(".skills__detail")?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Home",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(heading(dialog)).toBe("Alpha");
    expect(scroll.mock.contexts.at(-1)).toBe(skillButton(dialog, "a"));
    scroll.mockRestore();
  });

  it("leaves Left, Right, Escape and modified arrows alone when no skill has focus", () => {
    const { dialog } = open();
    expect(press("ArrowRight").defaultPrevented).toBe(false);
    expect(press("ArrowLeft").defaultPrevented).toBe(false);
    expect(press("ArrowDown", { shiftKey: true }).defaultPrevented).toBe(false);
    expect(press("ArrowDown", { altKey: true }).defaultPrevented).toBe(false);
    expect(heading(dialog)).toBe("Alpha");
  });

  it("leaves a text field's arrow keys alone", () => {
    const { dialog } = open();
    const input = document.createElement("input");
    dialog.querySelector(".skills__detail")?.append(input);
    input.focus();
    expect(press("ArrowDown").defaultPrevented).toBe(false);
    expect(press("End").defaultPrevented).toBe(false);
    expect(heading(dialog)).toBe("Alpha");
    expect(document.activeElement).toBe(input);
  });

  it("puts every skill button in the tab order", () => {
    const { dialog } = open();
    for (const button of dialog.querySelectorAll("button"))
      expect(button.tabIndex).toBe(0);
  });

  it("returns focus on close and starts at the first skill again on reopen", () => {
    const { dialog, layer: panels } = open();
    skillButton(dialog, "c").click();
    panels.sync(LEFT_FOCUSED);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(canvas);
    panels.sync(LEFT_PANEL);
    expect(heading(dialog)).toBe("Alpha");
  });

  it("shows the placeholder without skills", () => {
    const { dialog } = open([]);
    expect(dialog.querySelector(".skills__note")?.textContent).toBe(
      PANEL_PLACEHOLDER,
    );
    expect(dialog.querySelector(".skills__item")).toBeNull();
  });
});
