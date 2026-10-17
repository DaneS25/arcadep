import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadContent } from "@/content/index";
import type { Project } from "@/content/types";
import type { AppMode } from "@/logic/appState";
import {
  NEW_TAB_NOTE,
  PANEL_PLACEHOLDER,
  PANEL_TITLES,
  PROJECT_LINK_LABEL,
} from "./copy";
import {
  createPanelLayer,
  placeholderPanel,
  type PanelLayer,
} from "./panelLayer";
import { renderProjectPanel } from "./projectPanel";

const PROJECTS: readonly Project[] = [
  {
    id: "a",
    title: "Alpha App",
    description: "First project.",
    url: "https://example.com/a",
    thumbnail: "/assets/thumbnails/a.png",
    tags: ["TS", "Web"],
  },
  {
    id: "b",
    title: "Beta Game",
    description: "Second project.",
    url: "https://example.com/b",
    thumbnail: "/assets/thumbnails/b.png",
    tags: [],
  },
  {
    id: "c",
    title: "Gamma CLI",
    description: "Third project.",
    url: "https://example.com/c",
    thumbnail: "/assets/thumbnails/c.png",
    tags: ["CLI"],
  },
];

const BACK_PANEL: AppMode = { kind: "panel", side: "back" };
const BACK_FOCUSED: AppMode = { kind: "focused", side: "back" };

let root: HTMLElement;
let canvas: HTMLCanvasElement;
let layer: PanelLayer | undefined;

function open(
  projects: readonly Project[] = PROJECTS,
  hasThumbnail?: (path: string) => boolean,
) {
  const created = createPanelLayer({
    parent: root,
    onCloseRequest: vi.fn<() => void>(),
    fallbackFocus: () => canvas,
    render: (side, doc) =>
      side === "back"
        ? renderProjectPanel(projects, doc, hasThumbnail)
        : placeholderPanel(side, doc),
  });
  layer = created;
  created.sync(BACK_PANEL);
  return { dialog: created.element, layer: created };
}

function heading(dialog: HTMLElement): string | null | undefined {
  return dialog.querySelector("h3")?.textContent;
}

function link(dialog: HTMLElement): HTMLAnchorElement {
  const found = dialog.querySelector<HTMLAnchorElement>("a.projects__link");
  if (found === null) throw new Error("no project link");
  return found;
}

function projectButton(dialog: HTMLElement, id: string): HTMLButtonElement {
  const found = dialog.querySelector<HTMLButtonElement>(
    `button[data-project="${id}"]`,
  );
  if (found === null) throw new Error(`no button for ${id}`);
  return found;
}

function press(key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
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

describe("renderProjectPanel", () => {
  it("lists every project and shows the first one's card as real text", () => {
    const { dialog } = open();
    expect(dialog.querySelector("h2")?.textContent).toBe(PANEL_TITLES.back);
    expect(dialog.querySelectorAll(".projects__item")).toHaveLength(3);
    expect(heading(dialog)).toBe("Alpha App");
    const detail = dialog.querySelector(".projects__detail");
    expect(detail?.textContent).toContain("First project.");
    expect(detail?.getAttribute("aria-live")).toBe("polite");
    const tags = [...dialog.querySelectorAll(".projects__tags li")].map(
      (li) => li.textContent,
    );
    expect(tags).toEqual(["TS", "Web"]);
    expect(projectButton(dialog, "a").getAttribute("aria-current")).toBe(
      "true",
    );
  });

  it("links to the project in a new tab with noopener noreferrer", () => {
    const { dialog } = open();
    const a = link(dialog);
    expect(a.href).toBe("https://example.com/a");
    expect(a.target).toBe("_blank");
    expect(a.rel).toBe("noopener noreferrer");
    expect(a.textContent).toContain(PROJECT_LINK_LABEL);
    // Screen readers hear that a new tab opens.
    expect(a.querySelector(".visually-hidden")?.textContent).toContain(
      NEW_TAB_NOTE,
    );
  });

  it("leaves the link out for a URL that is not https", () => {
    const [first] = PROJECTS;
    if (first === undefined) throw new Error("no project");
    const { dialog } = open([
      { ...first, id: "x", url: "javascript:alert(1)" },
    ]);
    expect(heading(dialog)).toBe("Alpha App");
    expect(dialog.querySelector("a")).toBeNull();
  });

  it("shows the screenshot only when it loaded", () => {
    const loaded = new Set(["/assets/thumbnails/b.png"]);
    const { dialog } = open(PROJECTS, (path) => loaded.has(path));
    expect(dialog.querySelector("img")).toBeNull();
    projectButton(dialog, "b").click();
    const image = dialog.querySelector("img");
    expect(image?.getAttribute("src")).toBe("/assets/thumbnails/b.png");
    expect(image?.alt).toContain("Beta Game");
    // No tags, no empty list.
    expect(dialog.querySelector(".projects__tags")).toBeNull();
  });

  it("shows the projects from src/content", () => {
    const { projects } = loadContent(() => undefined);
    const view = renderProjectPanel(projects, document);
    const [rootNode] = view.body;
    if (!(rootNode instanceof HTMLElement)) throw new Error("no root");
    expect(rootNode.querySelector("h3")?.textContent).toBe(projects[0]?.title);
    expect(rootNode.querySelectorAll(".projects__item")).toHaveLength(
      projects.length,
    );
    view.dispose?.();
  });

  it("moves between projects with the arrow keys, Home and End while a project has focus", () => {
    const { dialog } = open();
    projectButton(dialog, "a").focus();

    const down = press("ArrowDown");
    expect(down.defaultPrevented).toBe(true);
    expect(heading(dialog)).toBe("Beta Game");
    expect(document.activeElement).toBe(projectButton(dialog, "b"));

    press("End");
    expect(heading(dialog)).toBe("Gamma CLI");
    press("ArrowUp");
    expect(heading(dialog)).toBe("Beta Game");
    press("Home");
    expect(heading(dialog)).toBe("Alpha App");
    expect(document.activeElement).toBe(projectButton(dialog, "a"));
  });

  it("moves through the projects with Up, Down, Home and End from the close button and the link", () => {
    const { dialog } = open();
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    // Focus starts on the close button.
    const down = press("ArrowDown");
    expect(down.defaultPrevented).toBe(true);
    expect(heading(dialog)).toBe("Beta Game");
    expect(document.activeElement).toBe(projectButton(dialog, "b"));
    expect(scroll.mock.contexts.at(-1)).toBe(projectButton(dialog, "b"));
    expect(scroll).toHaveBeenLastCalledWith({ block: "nearest" });

    link(dialog).focus();
    expect(press("End").defaultPrevented).toBe(true);
    expect(heading(dialog)).toBe("Gamma CLI");
    expect(document.activeElement).toBe(projectButton(dialog, "c"));
    link(dialog).focus();
    // It stops at the end rather than wrapping.
    press("ArrowDown");
    expect(heading(dialog)).toBe("Gamma CLI");
    link(dialog).focus();
    press("ArrowUp");
    expect(heading(dialog)).toBe("Beta Game");
    link(dialog).focus();
    press("Home");
    expect(heading(dialog)).toBe("Alpha App");
    expect(document.activeElement).toBe(projectButton(dialog, "a"));
    scroll.mockRestore();
  });

  it("leaves Left and Right alone on the link, so they don't move the choice", () => {
    const { dialog } = open();
    link(dialog).focus();
    expect(press("ArrowRight").defaultPrevented).toBe(false);
    expect(press("ArrowLeft").defaultPrevented).toBe(false);
    expect(heading(dialog)).toBe("Alpha App");
    expect(document.activeElement).toBe(link(dialog));
  });

  it("returns focus on close and starts at the first project again on reopen", () => {
    const { dialog, layer: panels } = open();
    projectButton(dialog, "c").click();
    expect(link(dialog).href).toBe("https://example.com/c");
    panels.sync(BACK_FOCUSED);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(canvas);
    panels.sync(BACK_PANEL);
    expect(heading(dialog)).toBe("Alpha App");
  });

  it("shows the placeholder without projects", () => {
    const { dialog } = open([]);
    expect(dialog.querySelector(".projects__description")?.textContent).toBe(
      PANEL_PLACEHOLDER,
    );
    expect(dialog.querySelector(".projects__item")).toBeNull();
  });
});

describe("renderProjectPanel's first project", () => {
  it("opens on the project whose poster was clicked", () => {
    const view = renderProjectPanel(PROJECTS, document, () => false, 2);
    const [rootNode] = view.body;
    if (!(rootNode instanceof HTMLElement)) throw new Error("no root");
    expect(rootNode.querySelector("h3")?.textContent).toBe("Gamma CLI");
    expect(
      rootNode
        .querySelector('[data-project="c"]')
        ?.getAttribute("aria-current"),
    ).toBe("true");
    view.dispose?.();
  });

  it("falls back to a project in range for a bad index", () => {
    for (const [index, title] of [
      [-1, "Alpha App"],
      [9, "Gamma CLI"],
      [1.5, "Alpha App"],
    ] as const) {
      const [rootNode] = renderProjectPanel(
        PROJECTS,
        document,
        () => false,
        index,
      ).body;
      if (!(rootNode instanceof HTMLElement)) throw new Error("no root");
      expect(rootNode.querySelector("h3")?.textContent).toBe(title);
    }
  });
});
