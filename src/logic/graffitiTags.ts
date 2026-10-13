/**
 * Procedural graffiti tags for the back wall (task 12): made-up tag names from random
 * syllables, scattered across the tag layer in a loose grid so they never all clump in
 * one corner. Seeded, so the wall looks the same on every load. The tag names are
 * generated decoration, not site content; the visitor's information is on the posters and
 * in the Projects panel.
 */

import type { PaletteToken } from "./palette";
import { createRng, type Rng } from "./rng";

export type TagStyle =
  /** Solid letters with a dark outline. */
  | "fill"
  /** Hollow letters: a coloured outline round dark fill. */
  | "outline"
  /** Fat letters with paint running down. */
  | "drip";

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
  readonly style: TagStyle;
  readonly drips: readonly TagDrip[];
};

/** The wall's fixed seed, so the same tags come back on every load. */
export const TAG_SEED = 0x7a6b1e55;

export const TAG_GRID = { columns: 5, rows: 3 } as const;

export const TAG_SIZES = {
  minSize: 0.11,
  maxSize: 0.18,
  maxAngleRad: 0.25,
  /** Tag centres stay this far inside the layer's edges. */
  edge: 0.08,
  maxDrips: 4,
} as const;

/** Spray colours: the neon accents and a pale one, all palette tokens. */
export const TAG_COLORS: readonly PaletteToken[] = [
  "accent",
  "cyan",
  "amber",
  "text",
];

const STYLES: readonly TagStyle[] = ["fill", "outline", "drip"];
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

/** One tag per cell of the grid (`TAG_GRID`), each jittered inside its cell. */
export function graffitiTags(seed: number): readonly TagSpec[] {
  const rng = createRng(seed);
  const { columns, rows } = TAG_GRID;
  const s = TAG_SIZES;
  const span = 1 - 2 * s.edge;
  const tags: TagSpec[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const style = rng.pick(STYLES) ?? "fill";
      const drips: TagDrip[] = [];
      if (style === "drip") {
        const count = rng.int(1, s.maxDrips + 1);
        for (let d = 0; d < count; d += 1)
          drips.push({ at: rng.range(-0.45, 0.45), length: rng.range(0.3, 1) });
      }
      tags.push({
        text: tagName(rng),
        x: s.edge + (span * (col + rng.range(0.2, 0.8))) / columns,
        y: s.edge + (span * (row + rng.range(0.25, 0.75))) / rows,
        size: rng.range(s.minSize, s.maxSize),
        angleRad: rng.range(-s.maxAngleRad, s.maxAngleRad),
        color: rng.pick(TAG_COLORS) ?? "accent",
        style,
        drips,
      });
    }
  }
  return tags;
}
