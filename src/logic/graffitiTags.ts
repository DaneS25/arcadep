/**
 * Procedural graffiti for the back wall (task 12, made chaotic in task 19): painted-over
 * buff patches, big bubble-letter throw-ups, tags (filled, hollow or dripping) and small
 * scrawled handstyles, painted in that order so later layers cover earlier ones. Throw-ups
 * and tags are scattered in loose grids so the whole wall fills up, from the ground into
 * the second storey; scrawls go anywhere. Seeded, so the wall looks the same on every load.
 * The names are generated decoration, not site content; the visitor's information is on
 * the posters and in the Projects panel.
 *
 * Positions are fractions of the tag layer (x from the left, y from the top); sizes are
 * letter heights as fractions of the layer's height.
 */

import type { PaletteToken } from "./palette";
import { createRng, type Rng } from "./rng";

export type TagStyle =
  /** Big rounded letters: a fill colour inside a fat outline, often dripping. */
  | "throwup"
  /** Solid letters with a dark outline. */
  | "fill"
  /** Hollow letters: a coloured outline round dark fill. */
  | "outline"
  /** Fat letters with paint running down. */
  | "drip"
  /** Small, thin, quick handstyle in one colour. */
  | "scrawl";

export type TagDrip = {
  /** Where along the tag, from -0.5 (left end) to 0.5 (right end) of its width. */
  readonly at: number;
  /** Length as a fraction of the tag's height. */
  readonly length: number;
};

export type TagSpec = {
  readonly text: string;
  /** Centre, as fractions of the tag layer (x from the left, y from the top). */
  readonly x: number;
  readonly y: number;
  /** Letter height as a fraction of the tag layer's height. */
  readonly size: number;
  readonly angleRad: number;
  readonly color: PaletteToken;
  /** The outline's colour (throw-ups, fill and drip tags); unused by scrawls. */
  readonly outline: PaletteToken;
  readonly style: TagStyle;
  readonly drips: readonly TagDrip[];
};

/** A rectangle of flat paint rolled over older graffiti (a "buff"), with tags on top. */
export type BuffPatch = {
  /** Centre and size, as fractions of the tag layer. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly angleRad: number;
  readonly color: PaletteToken;
};

export type GraffitiArt = {
  /** Painted first, under everything. */
  readonly buffs: readonly BuffPatch[];
  /** In paint order: throw-ups, then tags, then scrawls. */
  readonly tags: readonly TagSpec[];
};

/** The wall's fixed seed, so the same graffiti comes back on every load. */
export const TAG_SEED = 0x7a6b1e55;

type GridLayer = {
  readonly columns: number;
  readonly rows: number;
  readonly minSize: number;
  readonly maxSize: number;
  readonly maxAngleRad: number;
};

/** How much of each layer is painted, and how big. */
export const GRAFFITI_LAYERS = {
  /** About 0.75 to 1.2 m letters on the 9.95 m high layer. */
  throwup: {
    columns: 4,
    rows: 4,
    minSize: 0.075,
    maxSize: 0.12,
    maxAngleRad: 0.12,
  },
  /** About 0.35 to 0.65 m letters. */
  tag: {
    columns: 7,
    rows: 7,
    minSize: 0.035,
    maxSize: 0.065,
    maxAngleRad: 0.25,
  },
  /** About 14 to 28 cm letters, anywhere. */
  scrawl: { count: 90, minSize: 0.014, maxSize: 0.028, maxAngleRad: 0.4 },
  buff: {
    count: 7,
    minWidth: 0.08,
    maxWidth: 0.22,
    minHeight: 0.05,
    maxHeight: 0.14,
    maxAngleRad: 0.03,
  },
} as const;

export const TAG_SIZES = {
  /** Centres stay this far inside the layer's edges. */
  edge: 0.04,
  maxDrips: 5,
} as const;

/** Spray colours: the neon accents and a pale one, all palette tokens. */
export const TAG_COLORS: readonly PaletteToken[] = [
  "accent",
  "cyan",
  "violet",
  "purple",
  "text",
];

/** Outline colours: dark or pale, so the letters stand off the wall and each other. */
export const OUTLINE_COLORS: readonly PaletteToken[] = ["base", "text"];

/** Rolled-over paint in the wall's own dull greys. */
export const BUFF_COLORS: readonly PaletteToken[] = [
  "trim",
  "wall",
  "panel",
  "cabinet",
];

const TAG_STYLES: readonly TagStyle[] = ["fill", "outline", "drip"];
const CONSONANTS = "BKRSTVXZMN";
const VOWELS = "AEIOU";

function letter(source: string, pick: number): string {
  return source.charAt(Math.floor(pick * source.length));
}

/** A made-up tag name: two or three syllables, upper case, 4 to 7 letters. */
export function tagName(rng: Rng): string {
  const syllables = rng.int(2, 4);
  let name = "";
  for (let i = 0; i < syllables; i += 1) {
    name += letter(CONSONANTS, rng.next()) + letter(VOWELS, rng.next());
  }
  if (rng.next() < 0.5) name += letter(CONSONANTS, rng.next());
  return name;
}

/** A short throw-up name: 2 to 4 letters, as throw-ups are painted fast and big. */
export function throwupName(rng: Rng): string {
  const length = rng.int(2, 5);
  let name = "";
  for (let i = 0; i < length; i += 1)
    name += letter(i % 2 === 0 ? CONSONANTS : VOWELS, rng.next());
  return name;
}

function drips(rng: Rng, min: number): TagDrip[] {
  const count = rng.int(min, TAG_SIZES.maxDrips + 1);
  return Array.from({ length: count }, () => ({
    at: rng.range(-0.45, 0.45),
    length: rng.range(0.3, 1.2),
  }));
}

/** A centre jittered inside cell (`col`, `row`) of a grid over the layer's inner area. */
function cellCentre(
  rng: Rng,
  layer: GridLayer,
  col: number,
  row: number,
): { x: number; y: number } {
  const span = 1 - 2 * TAG_SIZES.edge;
  return {
    x: TAG_SIZES.edge + (span * (col + rng.range(0.2, 0.8))) / layer.columns,
    y: TAG_SIZES.edge + (span * (row + rng.range(0.2, 0.8))) / layer.rows,
  };
}

function gridLayer(
  rng: Rng,
  layer: GridLayer,
  make: (
    rng: Rng,
    at: { x: number; y: number },
    size: number,
    angleRad: number,
  ) => TagSpec,
): TagSpec[] {
  const out: TagSpec[] = [];
  for (let row = 0; row < layer.rows; row += 1)
    for (let col = 0; col < layer.columns; col += 1) {
      const at = cellCentre(rng, layer, col, row);
      const size = rng.range(layer.minSize, layer.maxSize);
      const angleRad = rng.range(-layer.maxAngleRad, layer.maxAngleRad);
      out.push(make(rng, at, size, angleRad));
    }
  return out;
}

/** Every piece on the wall, in paint order. */
export function graffitiArt(seed: number): GraffitiArt {
  const rng = createRng(seed);
  const L = GRAFFITI_LAYERS;
  const pickColor = (): PaletteToken => rng.pick(TAG_COLORS) ?? "accent";

  const buffs: BuffPatch[] = Array.from({ length: L.buff.count }, () => {
    const width = rng.range(L.buff.minWidth, L.buff.maxWidth);
    const height = rng.range(L.buff.minHeight, L.buff.maxHeight);
    return {
      x: rng.range(width / 2, 1 - width / 2),
      y: rng.range(height / 2, 1 - height / 2),
      width,
      height,
      angleRad: rng.range(-L.buff.maxAngleRad, L.buff.maxAngleRad),
      color: rng.pick(BUFF_COLORS) ?? "trim",
    };
  });

  const throwups = gridLayer(rng, L.throwup, (r, at, size, angleRad) => ({
    text: throwupName(r),
    ...at,
    size,
    angleRad,
    color: pickColor(),
    outline: r.pick(OUTLINE_COLORS) ?? "base",
    style: "throwup",
    drips: r.next() < 0.5 ? drips(r, 1) : [],
  }));

  const tags = gridLayer(rng, L.tag, (r, at, size, angleRad) => {
    const style = r.pick(TAG_STYLES) ?? "fill";
    return {
      text: tagName(r),
      ...at,
      size,
      angleRad,
      color: pickColor(),
      outline: "base",
      style,
      drips: style === "drip" ? drips(r, 1) : [],
    };
  });

  const edge = TAG_SIZES.edge;
  const scrawls: TagSpec[] = Array.from({ length: L.scrawl.count }, () => ({
    text: rng.next() < 0.5 ? tagName(rng) : throwupName(rng),
    x: rng.range(edge, 1 - edge),
    y: rng.range(edge, 1 - edge),
    size: rng.range(L.scrawl.minSize, L.scrawl.maxSize),
    angleRad: rng.range(-L.scrawl.maxAngleRad, L.scrawl.maxAngleRad),
    color: pickColor(),
    outline: "base",
    style: "scrawl",
    drips: [],
  }));

  return { buffs, tags: [...throwups, ...tags, ...scrawls] };
}

/** Rough width of a tag's letters over their height (marker letters run about 0.62 wide). */
export const LETTER_ASPECT = 0.62;

/**
 * A tag's rough axis-aligned bounds, as fractions of the layer, ignoring its tilt: enough
 * to tell which pieces overlap. `layerAspect` is the layer's width over its height.
 */
export function tagBounds(
  tag: TagSpec,
  layerAspect: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const halfW = (tag.text.length * LETTER_ASPECT * tag.size) / layerAspect / 2;
  const halfH = tag.size / 2;
  return {
    minX: tag.x - halfW,
    maxX: tag.x + halfW,
    minY: tag.y - halfH,
    maxY: tag.y + halfH,
  };
}
