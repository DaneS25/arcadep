import "./skillPanel.css";
import type { Skill } from "@/content/types";
import {
  PANEL_PLACEHOLDER,
  PANEL_TITLES,
  SKILLS_KEY_HINT,
  SKILLS_LIST_LABEL,
  SKILL_LEVEL_LABEL,
  SKILL_YEARS_LABEL,
  skillLevelText,
  skillYearsText,
} from "./copy";
import { listKeyHandler } from "./listKeys";
import type { PanelView } from "./panelLayer";

const LEVEL_MAX = 5;

/**
 * The left side's Skills panel: every skill from `src/content/skills.ts` as a button, and
 * the chosen skill's details (name, group, level 1 to 5, years, a line about it) as real
 * DOM text. Tab reaches every skill button; Up, Down, Home and End choose a skill from
 * anywhere in the panel (Left and Right too while a skill has focus), and choosing one
 * shows its details. Fits the panel layer, which owns opening, Escape and focus.
 */
export function renderSkillPanel(
  skills: readonly Skill[],
  doc: Document,
): PanelView {
  const root = doc.createElement("div");
  root.className = "skills";

  if (skills.length === 0) {
    const note = doc.createElement("p");
    note.className = "skills__note";
    note.textContent = PANEL_PLACEHOLDER;
    root.append(note);
    return { title: PANEL_TITLES.left, body: [root] };
  }

  const nav = doc.createElement("nav");
  nav.className = "skills__nav";
  nav.setAttribute("aria-label", SKILLS_LIST_LABEL);
  const list = doc.createElement("ul");
  list.className = "skills__list";
  const buttons = skills.map((skill) => {
    const item = doc.createElement("li");
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "skills__item";
    button.dataset.skill = skill.id;
    const name = doc.createElement("span");
    name.className = "skills__item-name";
    name.textContent = skill.name;
    const group = doc.createElement("span");
    group.className = "skills__item-group";
    group.textContent = skill.group;
    button.append(name, " ", group);
    item.append(button);
    list.append(item);
    return button;
  });
  const hint = doc.createElement("p");
  hint.className = "skills__hint";
  hint.setAttribute("aria-hidden", "true");
  hint.textContent = SKILLS_KEY_HINT;
  nav.append(list, hint);

  const detail = doc.createElement("div");
  detail.className = "skills__detail";
  // A new choice is read out; the skill's name leads.
  detail.setAttribute("aria-live", "polite");
  root.append(nav, detail);

  let index = 0;

  const fact = (label: string, value: Node[]): HTMLElement[] => {
    const dt = doc.createElement("dt");
    dt.textContent = label;
    const dd = doc.createElement("dd");
    dd.append(...value);
    return [dt, dd];
  };

  const draw = (): void => {
    const skill = skills[index];
    if (skill === undefined) return;
    const article = doc.createElement("article");
    article.className = "skills__card";
    const heading = doc.createElement("h3");
    heading.className = "skills__name";
    heading.textContent = skill.name;
    const group = doc.createElement("p");
    group.className = "skills__group";
    group.textContent = skill.group;

    const pips = doc.createElement("span");
    pips.className = "skills__pips";
    pips.setAttribute("aria-hidden", "true");
    for (let p = 0; p < LEVEL_MAX; p += 1) {
      const pip = doc.createElement("span");
      pip.className =
        p < skill.level ? "skills__pip skills__pip--on" : "skills__pip";
      pips.append(pip);
    }
    const levelText = doc.createElement("span");
    levelText.textContent = skillLevelText(skill.level, LEVEL_MAX);
    const facts = doc.createElement("dl");
    facts.className = "skills__facts";
    facts.append(
      ...fact(SKILL_LEVEL_LABEL, [pips, levelText]),
      ...fact(SKILL_YEARS_LABEL, [
        doc.createTextNode(skillYearsText(skill.years)),
      ]),
    );
    const note = doc.createElement("p");
    note.className = "skills__note";
    note.textContent = skill.note;
    article.append(heading, group, facts, note);
    detail.replaceChildren(article);
    root.dataset.skill = skill.id;

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
    title: PANEL_TITLES.left,
    body: [root],
    onKeyDown: listKeyHandler(buttons, () => index, choose),
    dispose() {
      for (const button of buttons) button.removeEventListener("click", onPick);
    },
  };
}
