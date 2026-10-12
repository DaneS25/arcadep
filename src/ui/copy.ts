/**
 * UI copy: labels and hints for the overlays and the scene. Site content (what the
 * visitor reads about the owner) lives in `src/content/`, not here.
 */

import type { Side } from "@/logic/buildingLayout";

/** Accessible name of the scene canvas (it gets focus back when a panel closes). */
export const SCENE_LABEL =
  "Arcade building. Arrow keys or Tab pick a side, Enter opens it, Escape closes it.";

/** Panel heading per side. */
export const PANEL_TITLES: Readonly<Record<Side, string>> = {
  front: "About",
  left: "Skills",
  back: "Projects",
  right: "Contact",
};

/** Shown until the side's task (10 to 13) fills its panel from `src/content/`. */
export const PANEL_PLACEHOLDER =
  "Nothing here yet. This panel is being wired up.";

export const CLOSE_LABEL = "Close";
/** Key hint shown on the close button (hidden from screen readers). */
export const CLOSE_HINT = "Esc";
