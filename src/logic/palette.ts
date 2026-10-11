/**
 * Colour tokens shared by the scene and the CSS (set as custom properties at start-up).
 * Secondary accents are added with the look pass (task 9).
 */
export const PALETTE = {
  /** Near-black base: page background, scene background. */
  base: "#07070b",
  /** Main red neon accent (loading screen now, neon strips from task 9). */
  accent: "#ff2a3d",
  /** Street surface before textures arrive. */
  ground: "#16161c",
  /** Building walls and the alley wall before textures arrive (blockout, task 5). */
  wall: "#2b2b35",
  /** Floor bands, roof and parapets. */
  trim: "#3a3a46",
  /** Pavement slab. */
  sidewalk: "#24242c",
} as const;

export type PaletteToken = keyof typeof PALETTE;

/** Every token as a CSS custom property (`--color-<token>`), ready to set on the document root. */
export function paletteCssVars(): { name: string; value: string }[] {
  return Object.entries(PALETTE).map(([token, value]) => ({
    name: `--color-${token}`,
    value,
  }));
}
