import "./crtPanel.css";
import type { AboutPage } from "@/content/types";
import {
  isAtLimit,
  pageCommandForKey,
  stepPage,
  type PageCommand,
} from "@/logic/pager";
import {
  CRT_KEY_HINT,
  CRT_NEXT,
  CRT_PAGES_LABEL,
  CRT_PREVIOUS,
  PANEL_PLACEHOLDER,
  PANEL_TITLES,
  crtPageCounter,
} from "./copy";
import type { PanelView } from "./panelLayer";

/**
 * The front side's CRT panel: the about pages from `src/content/profile.ts`, one at a time,
 * as real DOM text. Previous and Next buttons, one button per page, and the arrow keys
 * (Home and End too) move between pages. Fits the panel layer, which owns opening,
 * Escape and focus.
 */
export function renderCrtPanel(
  pages: readonly AboutPage[],
  doc: Document,
): PanelView {
  const root = doc.createElement("div");
  root.className = "crt";
  const screen = doc.createElement("div");
  screen.className = "crt__screen";
  // Page changes are read out; the page heading leads.
  screen.setAttribute("aria-live", "polite");
  root.append(screen);

  if (pages.length === 0) {
    const note = doc.createElement("p");
    note.className = "crt__text";
    note.textContent = PANEL_PLACEHOLDER;
    screen.append(note);
    return { title: PANEL_TITLES.front, body: [root] };
  }

  const nav = doc.createElement("nav");
  nav.className = "crt__nav";
  nav.setAttribute("aria-label", CRT_PAGES_LABEL);

  const makeButton = (label: string, className: string): HTMLButtonElement => {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    return button;
  };
  const previous = makeButton(CRT_PREVIOUS, "crt__step crt__step--previous");
  const next = makeButton(CRT_NEXT, "crt__step crt__step--next");
  const list = doc.createElement("ol");
  list.className = "crt__pages";
  const pageButtons = pages.map((page) => {
    const item = doc.createElement("li");
    const button = makeButton(page.heading, "crt__page-button");
    item.append(button);
    list.append(item);
    return button;
  });
  nav.append(previous, list, next);

  const hint = doc.createElement("p");
  hint.className = "crt__hint";
  hint.setAttribute("aria-hidden", "true");
  hint.textContent = CRT_KEY_HINT;
  root.append(nav, hint);

  let index = 0;

  const draw = (): void => {
    const page = pages[index];
    if (page === undefined) return;
    const article = doc.createElement("article");
    article.className = "crt__page";
    const counter = doc.createElement("p");
    counter.className = "crt__counter";
    counter.textContent = crtPageCounter(index + 1, pages.length);
    const heading = doc.createElement("h3");
    heading.className = "crt__heading";
    heading.textContent = page.heading;
    const text = doc.createElement("p");
    text.className = "crt__text";
    text.textContent = page.body;
    article.append(counter, heading, text);
    screen.replaceChildren(article);
    root.dataset.page = String(index);

    // aria-disabled (not disabled) keeps a focused button focused at either end.
    previous.setAttribute(
      "aria-disabled",
      String(isAtLimit(index, pages.length, "previous")),
    );
    next.setAttribute(
      "aria-disabled",
      String(isAtLimit(index, pages.length, "next")),
    );
    pageButtons.forEach((button, i) => {
      if (i === index) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  };

  const go = (command: PageCommand): void => {
    const target = stepPage(index, pages.length, command);
    if (target === index) return;
    index = target;
    draw();
  };

  const onPrevious = (): void => {
    go("previous");
  };
  const onNext = (): void => {
    go("next");
  };
  const onPick = (event: Event): void => {
    const i = pageButtons.findIndex((button) => button === event.currentTarget);
    if (i < 0 || i === index) return;
    index = i;
    draw();
  };
  previous.addEventListener("click", onPrevious);
  next.addEventListener("click", onNext);
  for (const button of pageButtons) button.addEventListener("click", onPick);

  draw();

  return {
    title: PANEL_TITLES.front,
    body: [root],
    onKeyDown(event) {
      const command = pageCommandForKey(event);
      if (command === undefined) return;
      // Ours, so the scene's arrow keys and the page's scrolling leave it alone.
      event.preventDefault();
      go(command);
    },
    dispose() {
      previous.removeEventListener("click", onPrevious);
      next.removeEventListener("click", onNext);
      for (const button of pageButtons)
        button.removeEventListener("click", onPick);
    },
  };
}
