/**
 * The neon skill signs on the left side (task 11): one sign per skill, laid out as a
 * staggered cluster inside the left interaction spot. Each sign is a glowing quad on a dark
 * backing plate. All the quads share one atlas texture (one cell per sign, stacked top to
 * bottom) and merge into one mesh; the plates merge into another. Pure numbers in metres;
 * `scene/sides/neonSigns.ts` builds the meshes.
 */

import type { Box, InteractionSpot, Side, Vec3 } from "./buildingLayout";
import { sideNormal } from "./buildingLayout";
import { spotFor, toWorld, worldBox, type GlowQuad } from "./cabinetLayout";
import type { PaletteToken } from "./palette";

export const SIGNS_SIDE: Side = "left";

/** At most this many signs are drawn; the Skills panel still lists every skill. */
export const MAX_SIGNS = 12;

/** One atlas cell per sign, 3.2:1 like the sign quads. */
export const SIGN_TEXTURE = {
  cellWidthPx: 512,
  cellHeightPx: 160,
} as const;

export const SIGN_SIZES = {
  /** Widest a sign gets. */
  maxWidthM: 1.4,
  /** Gaps between neighbouring signs. */
  gapAcrossM: 0.25,
  gapUpM: 0.3,
  /** Every other row shifts this far to the side, so the cluster isn't a neat grid. */
  staggerM: 0.15,
  /** Most signs in one row. */
  maxColumns: 3,
  /** The plate shows this far round each sign. */
  plateMarginM: 0.06,
  plateDepthM: 0.06,
  /** Gap between a sign's face and its plate, so they never z-fight. */
  faceGapM: 0.004,
} as const;

/** Neon colours the groups take in turn. */
const GROUP_COLORS: readonly PaletteToken[] = ["accent", "cyan", "amber"];

export type SignPlacement = {
  /** The glowing face, mapped to its own atlas cell. */
  readonly quad: GlowQuad;
  /** The dark plate behind it. */
  readonly plate: Box;
  readonly centre: Vec3;
};

export type SkillSignsLayout = {
  readonly side: Side;
  readonly id: InteractionSpot["id"];
  readonly spot: InteractionSpot;
  readonly signs: readonly SignPlacement[];
  readonly widthM: number;
  readonly heightM: number;
  /** The atlas canvas size: one cell per sign, stacked. */
  readonly atlas: { readonly widthPx: number; readonly heightPx: number };
};

/** Signs per row for `count` signs. */
export function signColumns(count: number): number {
  return Math.max(1, Math.min(SIGN_SIZES.maxColumns, Math.trunc(count)));
}

/** The atlas rows for sign `index` of `count`, as texture rows (0 at the bottom). */
export function atlasBand(
  index: number,
  count: number,
): { vMin: number; vMax: number } {
  return { vMin: 1 - (index + 1) / count, vMax: 1 - index / count };
}

/** The palette token each skill's sign glows in: one colour per group, in order of first use. */
export function signColors(groups: readonly string[]): readonly PaletteToken[] {
  const order: string[] = [];
  return groups.map((group) => {
    let i = order.indexOf(group);
    if (i < 0) {
      order.push(group);
      i = order.length - 1;
    }
    return GROUP_COLORS[i % GROUP_COLORS.length] ?? "accent";
  });
}

/** Where `count` signs (capped at `MAX_SIGNS`) hang in the left spot. */
export function skillSignsLayout(
  count: number,
  side: Side = SIGNS_SIDE,
): SkillSignsLayout {
  const spot = spotFor(side);
  const n = Math.max(0, Math.min(MAX_SIGNS, Math.trunc(count)));
  const columns = signColumns(n);
  const rows = Math.max(1, Math.ceil(n / columns));
  const aspect = SIGN_TEXTURE.cellWidthPx / SIGN_TEXTURE.cellHeightPx;
  const s = SIGN_SIZES;

  // As wide as the spot allows (stagger and plates included), then shrunk to fit its height too.
  let width = Math.min(
    s.maxWidthM,
    (spot.size.x -
      2 * (s.staggerM + s.plateMarginM) -
      (columns - 1) * s.gapAcrossM) /
      columns,
  );
  const heightFor = (w: number): number =>
    rows * (w / aspect) + (rows - 1) * s.gapUpM;
  const room = spot.size.y - 2 * s.plateMarginM;
  if (heightFor(width) > room)
    width = ((room - (rows - 1) * s.gapUpM) / rows) * aspect;
  const height = width / aspect;

  const totalHeight = heightFor(width);
  const topUp = spot.size.y / 2 + totalHeight / 2;
  const plateOut = s.plateDepthM / 2;
  const faceOut = s.plateDepthM + s.faceGapM;
  const normal = sideNormal(side);

  const signs: SignPlacement[] = [];
  for (let i = 0; i < n; i += 1) {
    const row = Math.floor(i / columns);
    const col = i % columns;
    const inRow = Math.min(columns, n - row * columns);
    const rowWidth = inRow * width + (inRow - 1) * s.gapAcrossM;
    const stagger = row % 2 === 0 ? -s.staggerM : s.staggerM;
    const across =
      -rowWidth / 2 + width / 2 + col * (width + s.gapAcrossM) + stagger;
    const up = topUp - height / 2 - row * (height + s.gapUpM);
    const at = (sa: number, su: number): Vec3 =>
      toWorld(spot, across + (sa * width) / 2, up + (su * height) / 2, faceOut);
    signs.push({
      quad: {
        corners: [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)],
        normal,
        ...atlasBand(i, n),
      },
      plate: worldBox(spot, {
        across,
        up,
        out: plateOut,
        size: {
          x: width + 2 * s.plateMarginM,
          y: height + 2 * s.plateMarginM,
          z: s.plateDepthM,
        },
      }),
      centre: toWorld(spot, across, up, faceOut),
    });
  }

  return {
    side,
    id: spot.id,
    spot,
    signs,
    widthM: width,
    heightM: height,
    atlas: {
      widthPx: SIGN_TEXTURE.cellWidthPx,
      heightPx: SIGN_TEXTURE.cellHeightPx * Math.max(1, n),
    },
  };
}
