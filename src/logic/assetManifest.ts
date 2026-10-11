/**
 * The assets the site looks for in `public/assets/`. Every one is optional: the user
 * downloads them, and the site falls back to plain colours and system fonts without them.
 * `public/assets/README.md` lists the same paths for the user.
 */

/** Base URL of the user-supplied assets (Vite serves `public/` at the site root). */
export const ASSET_BASE_URL = "/assets";

/** One ambientCG material per slot, each in `textures/<slot>/`. */
export const TEXTURE_SLOTS = [
  "concrete",
  "brick",
  "asphalt",
  "metal",
  "grate",
] as const;

export type TextureSlot = (typeof TEXTURE_SLOTS)[number];

/** The ambientCG maps kept for each material, renamed to these file names. */
export const TEXTURE_MAPS = {
  color: "Color.jpg",
  normal: "NormalGL.jpg",
  roughness: "Roughness.jpg",
} as const;

export type TextureMapKind = keyof typeof TEXTURE_MAPS;

export const TEXTURE_MAP_KINDS: readonly TextureMapKind[] = [
  "color",
  "normal",
  "roughness",
];

/** Plain colour used for a slot whose colour map is missing. */
export const TEXTURE_FALLBACK_COLORS: Readonly<Record<TextureSlot, string>> = {
  concrete: "#2a2a30",
  brick: "#3a2422",
  asphalt: "#16161c",
  metal: "#33363b",
  grate: "#26282c",
};

/** What each font is used for. */
export type FontRole = "neon" | "mono" | "marker";

export type FontAsset = {
  /** CSS family name; the file name is this without spaces (see `fontFileStem`). */
  readonly family: string;
  /** System fonts used when the file is missing or fails to load. */
  readonly fallback: string;
};

export const FONTS: Readonly<Record<FontRole, FontAsset>> = {
  neon: { family: "Orbitron", fallback: '"Arial Black", sans-serif' },
  mono: { family: "Share Tech Mono", fallback: '"Consolas", monospace' },
  marker: { family: "Permanent Marker", fallback: '"Comic Sans MS", cursive' },
};

/** URL of one map of one material, e.g. `/assets/textures/brick/Color.jpg`. */
export function textureUrl(slot: TextureSlot, kind: TextureMapKind): string {
  return `${ASSET_BASE_URL}/textures/${slot}/${TEXTURE_MAPS[kind]}`;
}

/** Font file name without extension: the family name with spaces removed, e.g. `ShareTechMono`. */
export function fontFileStem(font: FontAsset): string {
  return font.family.replaceAll(" ", "");
}

/** Font file types tried in order, with their CSS `format()` names. */
const FONT_FORMATS = [
  { extension: "woff2", format: "woff2" },
  { extension: "ttf", format: "truetype" },
] as const;

/** The font file URLs tried in order: `.woff2` first, then `.ttf`. */
export function fontUrls(font: FontAsset): string[] {
  const stem = `${ASSET_BASE_URL}/fonts/${fontFileStem(font)}`;
  return FONT_FORMATS.map(({ extension }) => `${stem}.${extension}`);
}

/** A CSS `src` descriptor for `FontFace`, trying each file in `fontUrls` order. */
export function fontFaceSource(font: FontAsset): string {
  const stem = `${ASSET_BASE_URL}/fonts/${fontFileStem(font)}`;
  return FONT_FORMATS.map(
    ({ extension, format }) =>
      `url("${stem}.${extension}") format("${format}")`,
  ).join(", ");
}

/** A CSS font stack: the downloaded family first only if it loaded, then the system fallback. */
export function fontStack(font: FontAsset, loaded: boolean): string {
  return loaded ? `"${font.family}", ${font.fallback}` : font.fallback;
}

/**
 * Every font role as a CSS custom property (`--font-<role>`). The downloaded family is
 * listed first: CSS skips it by itself while it is missing, so the stack is always safe.
 */
export function fontCssVars(): { name: string; value: string }[] {
  return Object.entries(FONTS).map(([role, font]) => ({
    name: `--font-${role}`,
    value: fontStack(font, true),
  }));
}
