import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppMode } from "@/logic/appState";
import { SIDES, type Side } from "@/logic/buildingLayout";
import { PANEL_PLACEHOLDER, PANEL_TITLES } from "./copy";
import {
  createPanelLayer,
  PANEL_TITLE_ID,
  placeholderPanel,
  type PanelLayer,
  type PanelLayerOptions,
} from "./panelLayer";

const EXPLORING: AppMode = { kind: "exploring" };
const focused = (side: Side): AppMode => ({ kind: "focused", side });
const panel = (side: Side): AppMode => ({ kind: "panel", side });

let root: HTMLElement;
let canvas: HTMLCanvasElement;
let layer: PanelLayer | undefined;

function setup(overrides: Partial<PanelLayerOptions> = {}) {
  const onCloseRequest = vi.fn<() => void>();
  const created = createPanelLayer({
    parent: root,
    onCloseRequest,
    fallbackFocus: () => canvas,
    ...overrides,
  });
  layer = created;
  return { layer: created, onCloseRequest };
}

function closeButton(dialog: HTMLDialogElement): HTMLButtonElement {
  const button = dialog.querySelector("button.panel__close");
  if (!(button instanceof HTMLButtonElement))
    throw new Error("no close button");
  return button;
}

/** Dispatches Tab where focus is, as the browser would. */
function pressTab(shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
}

function blurAll(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}

beforeEach(() => {
  root = document.createElement("main");
  canvas = document.createElement("canvas");
  canvas.tabIndex = -1;
  root.append(canvas);
  document.body.append(root);
});

afterEach(() => {
  layer?.dispose();
  layer = undefined;
  root.remove();
});

describe("placeholderPanel", () => {
  it.each(SIDES)("gives %s its heading and the placeholder note", (side) => {
    const view = placeholderPanel(side, document);
    expect(view.title).toBe(PANEL_TITLES[side]);
    expect(view.body.map((node) => node.textContent)).toEqual([
      PANEL_PLACEHOLDER,
    ]);
  });
});

describe("createPanelLayer", () => {
  it("adds a closed, labelled native dialog to the parent", () => {
    const { layer } = setup();
    expect(layer.element.tagName).toBe("DIALOG");
    expect(layer.element.parentElement).toBe(root);
    expect(layer.element.open).toBe(false);
    expect(layer.element.getAttribute("aria-labelledby")).toBe(PANEL_TITLE_ID);
    expect(layer.openSide).toBeUndefined();
  });

  it("stays closed while exploring or focused", () => {
    const { layer } = setup();
    layer.sync(EXPLORING);
    layer.sync(focused("left"));
    expect(layer.element.open).toBe(false);
  });

  it.each(SIDES)("opens the %s panel in the panel state", (side) => {
    const { layer } = setup();
    layer.sync(panel(side));
    const dialog = layer.element;
    expect(dialog.open).toBe(true);
    expect(dialog.dataset.side).toBe(side);
    expect(layer.openSide).toBe(side);
    const heading = document.getElementById(PANEL_TITLE_ID);
    expect(heading?.tagName).toBe("H2");
    expect(heading?.textContent).toBe(PANEL_TITLES[side]);
    expect(dialog.querySelector(".panel__body")?.textContent).toBe(
      PANEL_PLACEHOLDER,
    );
  });

  it("uses a custom renderer when given one", () => {
    const { layer } = setup({
      render: (side, doc) => {
        const p = doc.createElement("p");
        p.textContent = `body of ${side}`;
        return { title: `Title ${side}`, body: [p] };
      },
    });
    layer.sync(panel("back"));
    expect(layer.element.querySelector("h2")?.textContent).toBe("Title back");
    expect(layer.element.querySelector(".panel__body")?.textContent).toBe(
      "body of back",
    );
  });

  it("moves focus to the close button, with the key hint hidden from screen readers", () => {
    const { layer } = setup();
    layer.sync(panel("front"));
    const button = closeButton(layer.element);
    expect(document.activeElement).toBe(button);
    expect(button.type).toBe("button");
    expect(button.querySelector("[aria-hidden='true']")?.textContent).toBe(
      "Esc",
    );
  });

  it("returns focus to the element that had it when the state leaves the panel", () => {
    const opener = document.createElement("button");
    root.append(opener);
    opener.focus();
    const { layer } = setup();
    layer.sync(panel("left"));
    expect(document.activeElement).not.toBe(opener);

    layer.sync(focused("left"));
    expect(layer.element.open).toBe(false);
    expect(layer.openSide).toBeUndefined();
    expect(layer.element.dataset.side).toBeUndefined();
    expect(document.activeElement).toBe(opener);
  });

  it("falls back to the canvas when nothing had focus before", () => {
    blurAll();
    const { layer } = setup();
    layer.sync(panel("right"));
    layer.sync(focused("right"));
    expect(document.activeElement).toBe(canvas);
  });

  it("falls back to the canvas when the opener has gone", () => {
    const opener = document.createElement("button");
    root.append(opener);
    opener.focus();
    const { layer } = setup();
    layer.sync(panel("right"));
    opener.remove();
    layer.sync(EXPLORING);
    expect(document.activeElement).toBe(canvas);
  });

  it("swaps the content when the open side changes, keeping the opener", () => {
    canvas.focus();
    const { layer } = setup();
    layer.sync(panel("front"));
    layer.sync(panel("back"));
    expect(layer.element.open).toBe(true);
    expect(layer.element.dataset.side).toBe("back");
    expect(layer.element.querySelector("h2")?.textContent).toBe(
      PANEL_TITLES.back,
    );
    layer.sync(focused("back"));
    expect(document.activeElement).toBe(canvas);
  });

  describe("asks the state machine to close", () => {
    it("on Escape (the dialog cancel event), without closing by itself", () => {
      const { layer, onCloseRequest } = setup();
      layer.sync(panel("front"));
      const cancel = new Event("cancel", { cancelable: true });
      layer.element.dispatchEvent(cancel);
      expect(cancel.defaultPrevented).toBe(true);
      expect(onCloseRequest).toHaveBeenCalledOnce();
      expect(layer.element.open).toBe(true);
    });

    it("on the close button", () => {
      const { layer, onCloseRequest } = setup();
      layer.sync(panel("front"));
      closeButton(layer.element).click();
      expect(onCloseRequest).toHaveBeenCalledOnce();
    });

    it("on a click on the backdrop but not inside the frame", () => {
      const { layer, onCloseRequest } = setup();
      layer.sync(panel("front"));
      layer.element
        .querySelector(".panel__body")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(onCloseRequest).not.toHaveBeenCalled();
      layer.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(onCloseRequest).toHaveBeenCalledOnce();
    });

    it("when the browser closes the dialog itself, tidying up first", () => {
      canvas.focus();
      const { layer, onCloseRequest } = setup();
      layer.sync(panel("front"));
      layer.element.close();
      expect(onCloseRequest).toHaveBeenCalledOnce();
      expect(layer.openSide).toBeUndefined();
      expect(document.activeElement).toBe(canvas);
    });

    it("not when the layer closes the dialog for a state change", () => {
      const { layer, onCloseRequest } = setup();
      layer.sync(panel("front"));
      layer.sync(focused("front"));
      expect(onCloseRequest).not.toHaveBeenCalled();
    });
  });

  describe("focus trap", () => {
    function withLinks(): HTMLElement[] {
      const { layer } = setup({
        render: (_side, doc) => {
          const links = ["one", "two"].map((name) => {
            const a = doc.createElement("a");
            a.href = `https://example.com/${name}`;
            a.textContent = name;
            return a;
          });
          return { title: "Links", body: links };
        },
      });
      layer.sync(panel("back"));
      return [
        ...layer.element.querySelectorAll<HTMLElement>("button, a[href]"),
      ];
    }

    it("wraps Tab from the last element to the first", () => {
      const [first, , last] = withLinks();
      last?.focus();
      expect(pressTab().defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(first);
    });

    it("wraps Shift+Tab from the first element to the last", () => {
      const [first, , last] = withLinks();
      first?.focus();
      expect(pressTab(true).defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(last);
    });

    it("leaves Tab in the middle to the browser", () => {
      const [, middle] = withLinks();
      middle?.focus();
      expect(pressTab().defaultPrevented).toBe(false);
    });

    it("keeps focus on the close button when it is the only control", () => {
      const { layer } = setup();
      layer.sync(panel("front"));
      expect(pressTab().defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(closeButton(layer.element));
    });

    it("ignores other keys", () => {
      const { layer } = setup();
      layer.sync(panel("front"));
      const event = new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      });
      closeButton(layer.element).dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  it("removes the dialog and stops listening on dispose", () => {
    const { layer, onCloseRequest } = setup();
    layer.sync(panel("front"));
    const dialog = layer.element;
    layer.dispose();
    expect(dialog.isConnected).toBe(false);
    expect(dialog.open).toBe(false);
    closeButton(dialog).click();
    expect(onCloseRequest).not.toHaveBeenCalled();
  });
});
