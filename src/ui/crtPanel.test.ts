import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadContent } from "@/content/index";
import type { AboutPage } from "@/content/types";
import type { AppMode } from "@/logic/appState";
import {
  CRT_NEXT,
  CRT_PREVIOUS,
  PANEL_PLACEHOLDER,
  PANEL_TITLES,
} from "./copy";
import { renderCrtPanel } from "./crtPanel";
import {
  createPanelLayer,
  placeholderPanel,
  type PanelLayer,
} from "./panelLayer";

const PAGES: readonly AboutPage[] = [
  { heading: "One", body: "First page." },
  { heading: "Two", body: "Second page." },
  { heading: "Three", body: "Third page." },
];

const FRONT_PANEL: AppMode = { kind: "panel", side: "front" };
const FRONT_FOCUSED: AppMode = { kind: "focused", side: "front" };

let root: HTMLElement;
let canvas: HTMLCanvasElement;
let layer: PanelLayer | undefined;

function open(pages: readonly AboutPage[] = PAGES) {
  const onCloseRequest = vi.fn<() => void>();
  const created = createPanelLayer({
    parent: root,
    onCloseRequest,
    fallbackFocus: () => canvas,
    render: (side, doc) =>
      side === "front"
        ? renderCrtPanel(pages, doc)
        : placeholderPanel(side, doc),
  });
  layer = created;
  created.sync(FRONT_PANEL);
  return { dialog: created.element, onCloseRequest, layer: created };
}

function heading(dialog: HTMLElement): string | null | undefined {
  return dialog.querySelector("h3")?.textContent;
}

function button(dialog: HTMLElement, name: string): HTMLButtonElement {
  const found = [...dialog.querySelectorAll("button")].find(
    (b) => b.textContent === name,
  );
  if (found === undefined) throw new Error(`no button ${name}`);
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

describe("renderCrtPanel", () => {
  it("shows the About title and the first page as real headings and text", () => {
    const { dialog } = open();
    expect(dialog.querySelector("h2")?.textContent).toBe(PANEL_TITLES.front);
    expect(heading(dialog)).toBe("One");
    expect(dialog.querySelector(".crt__text")?.textContent).toBe("First page.");
    expect(dialog.querySelector(".crt__counter")?.textContent).toBe(
      "PAGE 1 / 3",
    );
  });

  it("shows the about pages from src/content", () => {
    const { profile } = loadContent(() => undefined);
    const view = renderCrtPanel(profile.aboutPages, document);
    const [rootNode] = view.body;
    if (!(rootNode instanceof HTMLElement)) throw new Error("no root");
    expect(rootNode.querySelector("h3")?.textContent).toBe(
      profile.aboutPages[0]?.heading,
    );
    expect(rootNode.querySelectorAll(".crt__page-button")).toHaveLength(
      profile.aboutPages.length,
    );
    view.dispose?.();
  });

  it("pages forward and back with the buttons and stops at both ends", () => {
    const { dialog } = open();
    const previous = button(dialog, CRT_PREVIOUS);
    const next = button(dialog, CRT_NEXT);
    expect(previous.getAttribute("aria-disabled")).toBe("true");
    expect(next.getAttribute("aria-disabled")).toBe("false");

    next.click();
    expect(heading(dialog)).toBe("Two");
    next.click();
    expect(heading(dialog)).toBe("Three");
    expect(next.getAttribute("aria-disabled")).toBe("true");
    next.click();
    expect(heading(dialog)).toBe("Three");

    previous.click();
    expect(heading(dialog)).toBe("Two");
  });

  it("jumps to a page from its button and marks it current", () => {
    const { dialog } = open();
    button(dialog, "Three").click();
    expect(heading(dialog)).toBe("Three");
    expect(button(dialog, "Three").getAttribute("aria-current")).toBe("page");
    expect(button(dialog, "One").hasAttribute("aria-current")).toBe(false);
  });

  it("pages with the arrow keys, Home and End wherever focus is in the panel", () => {
    const { dialog } = open();
    // Focus starts on the close button in the panel's header.
    const right = press("ArrowRight");
    expect(right.defaultPrevented).toBe(true);
    expect(heading(dialog)).toBe("Two");
    button(dialog, CRT_NEXT).focus();
    press("ArrowRight");
    expect(heading(dialog)).toBe("Three");
    press("Home");
    expect(heading(dialog)).toBe("One");
    press("End");
    expect(heading(dialog)).toBe("Three");
    press("ArrowLeft");
    expect(heading(dialog)).toBe("Two");
  });

  it("leaves other keys and modified arrows alone", () => {
    const { dialog } = open();
    expect(press("Enter").defaultPrevented).toBe(false);
    expect(press("ArrowRight", { altKey: true }).defaultPrevented).toBe(false);
    expect(heading(dialog)).toBe("One");
  });

  it("keeps a focused step button focused when it reaches the end", () => {
    const { dialog } = open();
    const next = button(dialog, CRT_NEXT);
    next.focus();
    next.click();
    next.click();
    expect(document.activeElement).toBe(next);
  });

  it("asks to close on Escape and returns focus when the state closes it", () => {
    const { dialog, onCloseRequest, layer } = open();
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(onCloseRequest).toHaveBeenCalledOnce();
    layer.sync(FRONT_FOCUSED);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(canvas);
  });

  it("starts on the first page again when reopened", () => {
    const { dialog, layer } = open();
    button(dialog, CRT_NEXT).click();
    layer.sync(FRONT_FOCUSED);
    layer.sync(FRONT_PANEL);
    expect(heading(dialog)).toBe("One");
  });

  it("stops listening once disposed", () => {
    const view = renderCrtPanel(PAGES, document);
    const [rootNode] = view.body;
    if (!(rootNode instanceof HTMLElement)) throw new Error("no root");
    view.dispose?.();
    button(rootNode, CRT_NEXT).click();
    expect(rootNode.querySelector("h3")?.textContent).toBe("One");
  });

  it("shows the placeholder line and no page buttons without pages", () => {
    const { dialog } = open([]);
    expect(dialog.querySelector(".crt__text")?.textContent).toBe(
      PANEL_PLACEHOLDER,
    );
    expect(dialog.querySelector(".crt__nav")).toBeNull();
  });
});
