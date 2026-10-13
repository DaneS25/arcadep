import "./projectPanel.css";
import type { Project } from "@/content/types";
import { isHttpsUrl } from "@/content/validate";
import { listCommandForKey, stepPage } from "@/logic/pager";
import {
  NEW_TAB_NOTE,
  PANEL_PLACEHOLDER,
  PANEL_TITLES,
  PROJECTS_KEY_HINT,
  PROJECTS_LIST_LABEL,
  PROJECT_LINK_LABEL,
  PROJECT_TAGS_LABEL,
  projectThumbnailAlt,
} from "./copy";
import type { PanelView } from "./panelLayer";

/**
 * The back side's Projects panel: every project from `src/content/projects.ts` as a
 * button, and the chosen project's card (screenshot when it loaded, title, tags,
 * description and a link that opens the hosted project in a new tab) as real DOM text.
 * Tab reaches every project button and then the link; the arrow keys (Home and End too)
 * move between projects while one has focus. Fits the panel layer, which owns opening,
 * Escape and focus.
 */
export function renderProjectPanel(
  projects: readonly Project[],
  doc: Document,
  /** Whether a thumbnail loaded; a missing one is left out rather than shown broken. */
  hasThumbnail: (path: string) => boolean = () => false,
  /** The project to show first: the poster clicked on the wall, else the first one. */
  initialIndex = 0,
): PanelView {
  const root = doc.createElement("div");
  root.className = "projects";

  if (projects.length === 0) {
    const note = doc.createElement("p");
    note.className = "projects__description";
    note.textContent = PANEL_PLACEHOLDER;
    root.append(note);
    return { title: PANEL_TITLES.back, body: [root] };
  }

  const nav = doc.createElement("nav");
  nav.className = "projects__nav";
  nav.setAttribute("aria-label", PROJECTS_LIST_LABEL);
  const list = doc.createElement("ul");
  list.className = "projects__list";
  const buttons = projects.map((project) => {
    const item = doc.createElement("li");
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "projects__item";
    button.dataset.project = project.id;
    button.textContent = project.title;
    item.append(button);
    list.append(item);
    return button;
  });
  const hint = doc.createElement("p");
  hint.className = "projects__hint";
  hint.setAttribute("aria-hidden", "true");
  hint.textContent = PROJECTS_KEY_HINT;
  nav.append(list, hint);

  const detail = doc.createElement("div");
  detail.className = "projects__detail";
  // A new choice is read out; the project's title leads.
  detail.setAttribute("aria-live", "polite");
  root.append(nav, detail);

  let index = Math.min(
    projects.length - 1,
    Math.max(0, Number.isInteger(initialIndex) ? initialIndex : 0),
  );

  const draw = (): void => {
    const project = projects[index];
    if (project === undefined) return;
    const card = doc.createElement("article");
    card.className = "projects__card";

    if (hasThumbnail(project.thumbnail)) {
      const image = doc.createElement("img");
      image.className = "projects__thumbnail";
      image.src = project.thumbnail;
      image.alt = projectThumbnailAlt(project.title);
      card.append(image);
    }

    const heading = doc.createElement("h3");
    heading.className = "projects__title";
    heading.textContent = project.title;
    card.append(heading);

    if (project.tags.length > 0) {
      const tags = doc.createElement("ul");
      tags.className = "projects__tags";
      tags.setAttribute("aria-label", PROJECT_TAGS_LABEL);
      for (const tag of project.tags) {
        const item = doc.createElement("li");
        item.textContent = tag;
        tags.append(item);
      }
      card.append(tags);
    }

    const description = doc.createElement("p");
    description.className = "projects__description";
    description.textContent = project.description;
    card.append(description);

    // Validation already drops non-https links; this keeps the panel safe on its own.
    if (isHttpsUrl(project.url)) {
      const link = doc.createElement("a");
      link.className = "projects__link";
      link.href = project.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const note = doc.createElement("span");
      note.className = "visually-hidden";
      note.textContent = ` ${NEW_TAB_NOTE}`;
      const arrow = doc.createElement("span");
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = " ↗";
      link.append(PROJECT_LINK_LABEL, note, arrow);
      card.append(link);
    }

    detail.replaceChildren(card);
    root.dataset.project = project.id;
    buttons.forEach((button, i) => {
      if (i === index) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
  };

  const choose = (target: number): void => {
    if (target === index) return;
    index = target;
    draw();
  };

  const onPick = (event: Event): void => {
    const i = buttons.findIndex((button) => button === event.currentTarget);
    if (i >= 0) choose(i);
  };
  for (const button of buttons) button.addEventListener("click", onPick);

  draw();

  return {
    title: PANEL_TITLES.back,
    body: [root],
    onKeyDown(event) {
      // Only while a project button has focus, so the arrows stay out of the link's way.
      const from = buttons.findIndex((button) => button === event.target);
      if (from < 0) return;
      const command = listCommandForKey(event);
      if (command === undefined) return;
      // Ours, so the scene's arrow keys and the page's scrolling leave it alone.
      event.preventDefault();
      const target = stepPage(from, buttons.length, command);
      choose(target);
      buttons[target]?.focus();
    },
    dispose() {
      for (const button of buttons) button.removeEventListener("click", onPick);
    },
  };
}
