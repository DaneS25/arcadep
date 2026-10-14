/**
 * Colour tokens shared by the scene and the CSS (set as custom properties at start-up).
 * Overlay text and surface tokens are checked for WCAG 2.2 AA contrast in the tests.
 */
export const PALETTE = {
  /** Near-black base: page background, scene background. */
  base: "#07070b",
  /** Main red neon accent (loading screen now, neon strips from task 9). */
  accent: "#ff2a3d",
  /** Secondary neon accent: focus rings and buttons on overlays. */
  cyan: "#22e4ff",
  /**
   * Deep purple neon, the secondary colour since the look feedback (user, 2026-10-13):
   * tubes, coloured lights and the environment. Too dark for small text; text uses `violet`.
   */
  purple: "#8f1cff",
  /** Readable purple for headings, tags and canvas text (AA on base and panel). */
  violet: "#a875ff",
  /** Overlay panel surface. */
  panel: "#0e0e15",
  /** Body text on the base and panel surfaces. */
  text: "#e6e6ee",
  /** Secondary text (captions, details). */
  muted: "#b4b4c2",
  /** Street surface before textures arrive. */
  ground: "#16161c",
  /** Building walls before textures arrive (blockout, task 5). */
  wall: "#2b2b35",
  /** Floor bands, roof and parapets. */
  trim: "#3a3a46",
  /** Pavement slab. */
  sidewalk: "#24242c",
  /** Arcade cabinet body (front side). */
  cabinet: "#1c1c26",
  /** Backing plates of the neon skill signs (left side). */
  signPlate: "#121219",
  /** Paste-up poster paper on the graffiti wall (back side). */
  posterPaper: "#d8d0bf",
  /** Door terminal housing and the side door (right side). */
  terminal: "#1a1a22",
  /** Detail props (AC units, pipes, vents, sign plates) before the metal texture arrives. */
  prop: "#4a4c58",
} as const;

export type PaletteToken = keyof typeof PALETTE;

/** Every token as a CSS custom property (`--color-<token>`), ready to set on the document root. */
export function paletteCssVars(): { name: string; value: string }[] {
  return Object.entries(PALETTE).map(([token, value]) => ({
    name: `--color-${token}`,
    value,
  }));
}
