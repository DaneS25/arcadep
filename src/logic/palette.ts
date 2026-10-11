/**
 * Colour tokens shared by the scene and the CSS (set as custom properties at start-up).
 * Accents are added with the look pass (task 9).
 */
export const PALETTE = {
  /** Near-black base: page background, scene background. */
  base: "#07070b",
  /** Street surface before textures arrive. */
  ground: "#16161c",
} as const;

export type PaletteToken = keyof typeof PALETTE;

/** Every token as a CSS custom property (`--color-<token>`), ready to set on the document root. */
export function paletteCssVars(): { name: string; value: string }[] {
  return Object.entries(PALETTE).map(([token, value]) => ({
    name: `--color-${token}`,
    value,
  }));
}
