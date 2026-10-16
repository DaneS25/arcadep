/**
 * Wear on the props (task 22 review): worn edges, stickers and scuffs on the arcade cabinet
 * and the detail props (sign boxes, AC units, doors), so they stop looking new. Pure
 * numbers; `scene/grime.ts` draws the sticker tile and patches the materials.
 *
 * Worn edges come from where each fragment sits on its box face: every box vertex gets its
 * corner's position on the face in metres (`faceUv`) and the face's size (`faceSize`), so
 * the shader knows how far it is from the nearest edge.
 */

import { BOX_FACES } from "./boxGeometry";
import type { Box, Vec3 } from "./buildingLayout";
import type { DetailKind, DetailLayout } from "./detailLayout";
import { PALETTE } from "./palette";
import { createRng } from "./rng";
import type { Tint } from "./grimeLayout";

/** How worn edges look. */
export const WEAR = {
  /** Paint wears off within this distance of an edge. */
  edgeM: 0.06,
  /** Faces thinner than this many edge widths don't wear (thin frames and rods would go all pale). */
  minFaceEdges: 4,
  /** Size of the wear's noise cells, so the worn edge is broken, not a clean stripe. */
  noiseCellM: 0.015,
  /** Share of an edge that is worn through. */
  coverage: 0.7,
  /** The bare, scuffed surface under the paint: a pale cold grey (linear). */
  color: [0.62, 0.6, 0.65] as Tint,
  /** How far the worn colour replaces the paint, at most. */
  strength: 0.85,
  /** The cabinet's dirty base: darker within this height of the pavement. */
  baseHeightM: 0.7,
  baseStrength: 0.65,
} as const;

/** Faces without a box (beams, quads): no edge anywhere near. */
const NO_EDGE = { uv: [1, 1], size: [2, 2] } as const;

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * Each box vertex's corner on its face (metres from the face's bottom-left) and the face's
 * size, in `boxesGeometryData`'s vertex order (6 faces of 4 corners per box).
 */
export function boxFaceCoords(boxes: readonly Box[]): {
  faceUvs: number[];
  faceSizes: number[];
} {
  const faceUvs: number[] = [];
  const faceSizes: number[] = [];
  for (const box of boxes)
    for (const { r, u } of BOX_FACES) {
      const w = Math.abs(dot(box.size, r));
      const h = Math.abs(dot(box.size, u));
      for (const [sr, su] of [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ] as const) {
        faceUvs.push(sr * w, su * h);
        faceSizes.push(w, h);
      }
    }
  return { faceUvs, faceSizes };
}

/** The detail parts that get stickers: metal boxes, sign boxes and doors. */
export const STICKER_KINDS: readonly DetailKind[] = [
  "metal",
  "plate",
  "signPlate",
  "door",
];

/**
 * The details mesh's wear attributes for `vertexCount` vertices: the boxes first (as laid
 * out by `detailGeometryData`), then the beams and quads with no edges and no stickers.
 */
export function detailWearAttributes(
  layout: DetailLayout,
  vertexCount: number,
): { faceUvs: number[]; faceSizes: number[]; stickers: number[] } {
  const { faceUvs, faceSizes } = boxFaceCoords(
    layout.boxes.map((part) => part.box),
  );
  const stickers: number[] = [];
  for (const part of layout.boxes) {
    const on = !part.noStickers && STICKER_KINDS.includes(part.kind) ? 1 : 0;
    for (let i = 0; i < 24; i += 1) stickers.push(on);
  }
  while (stickers.length < vertexCount) {
    faceUvs.push(...NO_EDGE.uv);
    faceSizes.push(...NO_EDGE.size);
    stickers.push(0);
  }
  return { faceUvs, faceSizes, stickers };
}

/** The sticker tile: 512 px, repeating every 2 m on the props' UVs. */
export const STICKER_TILE = {
  sizePx: 512,
  tileM: 2,
  seed: 0x571c4e,
  /** Stickers keep this far from the tile's edges, so none is cut by the repeat. */
  marginM: 0.08,
} as const;

/** Paper colours: the neon palette's, a pale one and a black one. No yellow or amber. */
export const STICKER_COLORS: readonly string[] = [
  PALETTE.accent,
  PALETTE.cyan,
  PALETTE.violet,
  PALETTE.purple,
  PALETTE.text,
  "#141418",
];

export type Sticker = {
  /** Centre, in metres within the tile (`y` up). */
  readonly along: number;
  readonly y: number;
  readonly widthM: number;
  readonly heightM: number;
  readonly angleRad: number;
  readonly shape: "rect" | "round";
  readonly paper: string;
  /** Ink for the stripe or ring printed on it. */
  readonly ink: string;
  /** How much of it has peeled off (a torn corner), 0 to 0.5. */
  readonly torn: number;
  /** Faded: how opaque it still is. */
  readonly opacity: number;
};

/** The stickers on the tile, seeded, none crossing its edges. */
export function stickers(seed: number = STICKER_TILE.seed): Sticker[] {
  const rng = createRng(seed);
  const tile = STICKER_TILE.tileM;
  const out: Sticker[] = [];
  for (let i = 0; i < 12; i += 1) {
    const widthM = rng.range(0.08, 0.26);
    const heightM = widthM * rng.range(0.45, 1);
    // The rotated sticker fits in a circle of its half diagonal.
    const reach = Math.hypot(widthM, heightM) / 2 + STICKER_TILE.marginM;
    const paper = rng.pick(STICKER_COLORS) ?? PALETTE.text;
    const inks = STICKER_COLORS.filter((c) => c !== paper);
    out.push({
      along: rng.range(reach, tile - reach),
      y: rng.range(reach, tile - reach),
      widthM,
      heightM,
      angleRad: rng.range(-0.5, 0.5),
      shape: rng.next() < 0.3 ? "round" : "rect",
      paper,
      ink: rng.pick(inks) ?? PALETTE.base,
      torn: rng.range(0, 0.5),
      opacity: rng.range(0.75, 1),
    });
  }
  return out;
}
