/**
 * The graffiti alley on the back side (task 12): a wall of procedural tags with a paste-up
 * poster per project on top. Since task 19 the tags cover the whole back wall from the
 * ground up into the second storey (`TAG_AREA`). Since task 27 the posters are much bigger
 * and spread over all three floors, each in its own hand-placed slot (`POSTER_SLOTS`) clear
 * of the doors, windows, fire escape, lamp, ducts, pipes and AC units; only the posters
 * themselves are picked. The tags and every poster share one atlas canvas texture: the tag
 * layer across the top band, then one cell per poster below it. All the quads merge into
 * one mesh (one draw call). Pure numbers in metres and pixels;
 * `scene/sides/graffitiWall.ts` builds the mesh and draws the atlas.
 *
 * Local coordinates as in `cabinetLayout`: `across` runs to the right of a visitor facing
 * the wall (0 at the spot's centre), `up` from the spot's bottom, `out` from the spot's
 * back face.
 */

import type { GeometryData } from "./boxGeometry";
import type { InteractionSpot, Side, Vec3 } from "./buildingLayout";
import {
  WINDOW,
  floorLevels,
  glassRects,
  openingRect,
  pointOnSide,
  wallOpenings,
  sideAzimuthRad,
  sideNormal,
  sideWidthM,
  type WallRect,
} from "./buildingLayout";
import { spotFor, toLocal, toWorld } from "./cabinetLayout";
import type { CameraPose } from "./cameraOrbit";
import { grimeMarks, type TintId } from "./grimeLayout";
import { TAG_COLORS } from "./graffitiTags";
import { PALETTE } from "./palette";
import { createRng } from "./rng";

export const GRAFFITI_SIDE: Side = "back";

/**
 * Where the tags go (task 19): the whole back wall, from just off the ground up past the
 * second storey's floor line, so the paint reaches into the second storey. Heights in
 * metres above the ground; the width stops short of the drain pipes at each end.
 */
export const TAG_AREA = {
  widthM: sideWidthM("back") - 0.2,
  bottomY: 0.05,
  /** Second storey's floor line plus how far the highest paint reaches into it. */
  topY: (floorLevels()[2]?.baseY ?? 8.5) + 1.5,
} as const;

/**
 * The atlas: 2048 x 2048 px (2K, see decisions.md, task 19: the tags now cover a 12 x 9 m
 * wall). The top 1727 rows hold the tag layer, the same shape as `TAG_AREA` (about 174 px
 * a metre); below it one row of 8 poster cells of 256 x 320 px (4:5, like a poster).
 */
export const GRAFFITI_TEXTURE = {
  widthPx: 2048,
  heightPx: 2048,
  wallHeightPx: 1727,
  posterWidthPx: 256,
  posterHeightPx: 320,
  posterColumns: 8,
} as const;

/**
 * Where the posters are pasted (task 27), in wall coordinates on the back side: `alongM` to
 * the right of a visitor facing the wall, `centreY` above the ground, and how wide the
 * poster is. Hand-placed like the windows, round everything fixed on the wall: three on the
 * ground floor between the back doors, one on the first floor between its right-hand window
 * and the fire escape, two on the second floor either side. Filled in this order, so even a
 * few projects spread over all three floors (ground, first, second, then the gaps).
 */
export const POSTER_SLOTS: readonly {
  readonly alongM: number;
  readonly centreY: number;
  readonly widthM: number;
  /** How far the poster may wander from the slot's centre, across and up. */
  readonly jitterAcrossM: number;
  readonly jitterUpM: number;
}[] = [
  // Ground floor, middle: between the back doors, under the floor band's neon.
  {
    alongM: -0.6,
    centreY: 2.35,
    widthM: 1.8,
    jitterAcrossM: 0.05,
    jitterUpM: 0.1,
  },
  // First floor: right of its right-hand window, left of the fire escape's landing.
  {
    alongM: 2.55,
    centreY: 6.75,
    widthM: 1.7,
    jitterAcrossM: 0.05,
    jitterUpM: 0.1,
  },
  // Second floor, left: between the drain pipe and the window, under the pipe run.
  {
    alongM: -4.72,
    centreY: 9.95,
    widthM: 1.15,
    jitterAcrossM: 0.02,
    jitterUpM: 0.1,
  },
  // Ground floor, left and right of the middle one.
  {
    alongM: -3.05,
    centreY: 2.35,
    widthM: 1.8,
    jitterAcrossM: 0.05,
    jitterUpM: 0.1,
  },
  {
    alongM: 1.85,
    centreY: 2.35,
    widthM: 1.8,
    jitterAcrossM: 0.05,
    jitterUpM: 0.1,
  },
  // Second floor, right: between the window and the AC unit.
  {
    alongM: 2.69,
    centreY: 9.95,
    widthM: 1.4,
    jitterAcrossM: 0.03,
    jitterUpM: 0.1,
  },
];

/** At most this many posters are pasted up; the Projects panel still lists every project. */
export const MAX_POSTERS = POSTER_SLOTS.length;

export const POSTER_SIZES = {
  /** Height over width, the same as an atlas cell. */
  aspect: GRAFFITI_TEXTURE.posterHeightPx / GRAFFITI_TEXTURE.posterWidthPx,
  /** Posters are pasted a little crooked, up to this much either way. */
  maxTiltRad: 0.06,
} as const;

/**
 * The most of the back wall a poster in slot `index` can cover, crooked and shifted as far
 * as it may go: the rectangle the other props keep clear of (the generator and the wires in
 * tasks 28 and 29 too).
 */
export function posterSlotRect(index: number): WallRect | undefined {
  const slot = POSTER_SLOTS[index];
  if (slot === undefined) return undefined;
  const half = tiltedHalfExtents(
    slot.widthM,
    slot.widthM * POSTER_SIZES.aspect,
    POSTER_SIZES.maxTiltRad,
  );
  return {
    side: GRAFFITI_SIDE,
    minAlong: slot.alongM - half.x - slot.jitterAcrossM,
    maxAlong: slot.alongM + half.x + slot.jitterAcrossM,
    minY: slot.centreY - half.y - slot.jitterUpM,
    maxY: slot.centreY + half.y + slot.jitterUpM,
  };
}

/** Every slot's rectangle (`posterSlotRect`), whether or not a poster is pasted in it. */
export function posterKeepOut(): WallRect[] {
  return POSTER_SLOTS.flatMap((_, i) => {
    const rect = posterSlotRect(i);
    return rect === undefined ? [] : [rect];
  });
}

/** Distance out from the spot's back face: the tags just off the wall, the posters over them. */
export const LAYER_OUT_M = {
  tags: 0.01,
  posters: 0.016,
  /** The invisible pick quads, just in front of the posters. */
  pick: 0.02,
} as const;

/** A textured quad mapped to its own rectangle of the atlas (u and v from 0 to 1, v up). */
export type AtlasQuad = {
  /** Corners: bottom-left, bottom-right, top-right, top-left, seen from the front. */
  readonly corners: readonly [Vec3, Vec3, Vec3, Vec3];
  readonly normal: Vec3;
  readonly uMin: number;
  readonly uMax: number;
  readonly vMin: number;
  readonly vMax: number;
};

/** A rectangle of the atlas canvas in pixels, top-left origin. */
export type PixelRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type PosterPlacement = {
  readonly quad: AtlasQuad;
  /** Its cell of the atlas, for drawing. */
  readonly cell: PixelRect;
  /** Local centre and size, for the tests and the camera. */
  readonly across: number;
  readonly up: number;
  readonly widthM: number;
  readonly heightM: number;
  readonly tiltRad: number;
  readonly centre: Vec3;
};

export type GraffitiLayout = {
  readonly side: Side;
  readonly id: InteractionSpot["id"];
  readonly spot: InteractionSpot;
  /** The tag layer, covering `TAG_AREA` (the whole back wall up into the second storey). */
  readonly wall: AtlasQuad;
  /**
   * The picked areas: one invisible quad over each poster, just in front of it (task 27).
   * Clicks on the rest of the graffiti do nothing, so only a poster opens the Projects panel.
   */
  readonly pickAreas: readonly AtlasQuad[];
  /** Its band of the atlas. */
  readonly wallRect: PixelRect;
  /**
   * The windows' glass and frames on this wall, in atlas pixels (task 20): wiped clear
   * after the paint, so the graffiti stops at each frame and the glass stays clean. Doors
   * and boarded windows are not in it; they get painted over.
   */
  readonly clearRects: readonly PixelRect[];
  readonly posters: readonly PosterPlacement[];
};

/** The atlas rectangle of poster `index`'s cell. */
export function posterCell(index: number): PixelRect {
  const t = GRAFFITI_TEXTURE;
  const col = index % t.posterColumns;
  const row = Math.floor(index / t.posterColumns);
  return {
    x: col * t.posterWidthPx,
    y: t.wallHeightPx + row * t.posterHeightPx,
    width: t.posterWidthPx,
    height: t.posterHeightPx,
  };
}

/** A pixel rectangle as texture coordinates (v up, 0 at the bottom). */
export function rectUv(rect: PixelRect): {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
} {
  const t = GRAFFITI_TEXTURE;
  return {
    uMin: rect.x / t.widthPx,
    uMax: (rect.x + rect.width) / t.widthPx,
    vMin: 1 - (rect.y + rect.height) / t.heightPx,
    vMax: 1 - rect.y / t.heightPx,
  };
}

/**
 * Half the width and height a `width` x `height` rectangle covers once turned by `tiltRad`
 * (its axis-aligned bounds).
 */
export function tiltedHalfExtents(
  width: number,
  height: number,
  tiltRad: number,
): { x: number; y: number } {
  const c = Math.abs(Math.cos(tiltRad));
  const s = Math.abs(Math.sin(tiltRad));
  return {
    x: (c * width + s * height) / 2,
    y: (s * width + c * height) / 2,
  };
}

/**
 * Where `count` posters (capped at `MAX_POSTERS`) are pasted on the back wall: one in each
 * of the first `count` slots of `POSTER_SLOTS`, a little crooked and a little off the slot's
 * centre. `seed` fixes the crookedness, so the wall looks the same on every load.
 */
export function graffitiLayout(
  count: number,
  seed: number,
  side: Side = GRAFFITI_SIDE,
): GraffitiLayout {
  const spot = spotFor(side);
  const s = POSTER_SIZES;
  const n = Math.max(0, Math.min(MAX_POSTERS, Math.trunc(count)));
  const normal = sideNormal(side);
  const rng = createRng(seed);

  const quadAt = (
    across: number,
    up: number,
    out: number,
    width: number,
    height: number,
    tiltRad: number,
    uv: ReturnType<typeof rectUv>,
  ): AtlasQuad => {
    const cos = Math.cos(tiltRad);
    const sin = Math.sin(tiltRad);
    const at = (sa: number, su: number): Vec3 => {
      const ox = (sa * width) / 2;
      const oy = (su * height) / 2;
      return toWorld(
        spot,
        across + ox * cos - oy * sin,
        up + ox * sin + oy * cos,
        out,
      );
    };
    return {
      corners: [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)],
      normal,
      ...uv,
    };
  };

  const wallRect: PixelRect = {
    x: 0,
    y: 0,
    width: GRAFFITI_TEXTURE.widthPx,
    height: GRAFFITI_TEXTURE.wallHeightPx,
  };
  // `up` is measured from the spot's bottom, so the area's ground-level edge is below 0.
  const spotBottomY = spot.position.y - spot.size.y / 2;
  const wall = quadAt(
    0,
    (TAG_AREA.bottomY + TAG_AREA.topY) / 2 - spotBottomY,
    LAYER_OUT_M.tags,
    TAG_AREA.widthM,
    TAG_AREA.topY - TAG_AREA.bottomY,
    0,
    rectUv(wallRect),
  );
  // Slots are in wall coordinates; the quads in the spot's local ones.
  const local = (alongM: number, y: number) =>
    toLocal(spot, pointOnSide(side, alongM, y, 0));

  const posters: PosterPlacement[] = [];
  for (let i = 0; i < n; i += 1) {
    const slot = POSTER_SLOTS[i];
    if (slot === undefined) break;
    const width = slot.widthM;
    const height = width * s.aspect;
    const tiltRad = rng.range(-s.maxTiltRad, s.maxTiltRad);
    const centre = local(
      slot.alongM + rng.range(-1, 1) * slot.jitterAcrossM,
      slot.centreY + rng.range(-1, 1) * slot.jitterUpM,
    );
    const { across, up } = centre;
    const cell = posterCell(i);
    posters.push({
      quad: quadAt(
        across,
        up,
        LAYER_OUT_M.posters,
        width,
        height,
        tiltRad,
        rectUv(cell),
      ),
      cell,
      across,
      up,
      widthM: width,
      heightM: height,
      tiltRad,
      centre: toWorld(spot, across, up, LAYER_OUT_M.posters),
    });
  }
  const pickAreas = posters.map((p) =>
    quadAt(
      p.across,
      p.up,
      LAYER_OUT_M.pick,
      p.widthM,
      p.heightM,
      p.tiltRad,
      rectUv(p.cell),
    ),
  );

  const clearRects = glassRects(side).map((rect) =>
    wallPixelRect(spot, wallRect, rect),
  );

  return {
    side,
    id: spot.id,
    spot,
    wall,
    pickAreas,
    wallRect,
    clearRects,
    posters,
  };
}

/**
 * A rectangle on the wall as pixels of the tag layer (`wallRect`), widened to whole pixels
 * and cut to the layer. The layer covers `TAG_AREA`, centred on the spot, `u` to the right
 * as seen facing the wall and rows down from `TAG_AREA.topY`.
 */
export function wallPixelRect(
  spot: InteractionSpot,
  wallRect: PixelRect,
  rect: WallRect,
): PixelRect {
  const across = (along: number): number =>
    toLocal(spot, pointOnSide(spot.side, along, 0, 0)).across;
  const pxPerM = wallRect.width / TAG_AREA.widthM;
  const pyPerM = wallRect.height / (TAG_AREA.topY - TAG_AREA.bottomY);
  const clampX = (x: number): number =>
    Math.min(wallRect.x + wallRect.width, Math.max(wallRect.x, x));
  const clampY = (y: number): number =>
    Math.min(wallRect.y + wallRect.height, Math.max(wallRect.y, y));
  const x0 = clampX(
    Math.floor(
      wallRect.x + (across(rect.minAlong) + TAG_AREA.widthM / 2) * pxPerM,
    ),
  );
  const x1 = clampX(
    Math.ceil(
      wallRect.x + (across(rect.maxAlong) + TAG_AREA.widthM / 2) * pxPerM,
    ),
  );
  const y0 = clampY(
    Math.floor(wallRect.y + (TAG_AREA.topY - rect.maxY) * pyPerM),
  );
  const y1 = clampY(
    Math.ceil(wallRect.y + (TAG_AREA.topY - rect.minY) * pyPerM),
  );
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Vertex data for atlas quads as one mesh, each mapped to its own atlas rectangle. */
export function atlasQuadGeometryData(
  quads: readonly AtlasQuad[],
): GeometryData {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const quad of quads) {
    const base = positions.length / 3;
    const quadUvs = [
      [quad.uMin, quad.vMin],
      [quad.uMax, quad.vMin],
      [quad.uMax, quad.vMax],
      [quad.uMin, quad.vMax],
    ] as const;
    quad.corners.forEach((corner, i) => {
      positions.push(corner.x, corner.y, corner.z);
      normals.push(quad.normal.x, quad.normal.y, quad.normal.z);
      const uv = quadUvs[i] ?? [0, 0];
      uvs.push(uv[0], uv[1]);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, uvs, indices };
}

/**
 * One flag per vertex of the graffiti mesh, in `[wall, ...posters]` quad order: 0 for the
 * paint, 1 for a poster. The material brightens only flagged vertices on hover (task 19),
 * so the posters light up as the button and the paint stays put, in the same draw call.
 */
export function posterVertexFlags(layout: GraffitiLayout): number[] {
  return [
    ...Array<number>(4).fill(0),
    ...layout.posters.flatMap(() => Array<number>(4).fill(1)),
  ];
}

/**
 * How much the posters' glow is scaled on top of the material's emissive intensity:
 * up to the lit intensity while hovered or focused, else unchanged.
 */
export function posterGlowScale(
  highlighted: boolean,
  baseIntensity: number,
  litIntensity: number,
): number {
  return highlighted && baseIntensity > 0 ? litIntensity / baseIntensity : 1;
}

/**
 * The poster under a point on the wall (a picking hit, in world coordinates), as an index
 * into `layout.posters` (and so into the projects shown), or undefined between posters.
 * Each poster is tested in its own tilted frame.
 */
export function posterAt(
  layout: GraffitiLayout,
  point: Vec3,
): number | undefined {
  const local = toLocal(layout.spot, point);
  const index = layout.posters.findIndex((poster) => {
    const dx = local.across - poster.across;
    const dy = local.up - poster.up;
    const cos = Math.cos(poster.tiltRad);
    const sin = Math.sin(poster.tiltRad);
    const x = dx * cos + dy * sin;
    const y = -dx * sin + dy * cos;
    return (
      Math.abs(x) <= poster.widthM / 2 && Math.abs(y) <= poster.heightM / 2
    );
  });
  return index < 0 ? undefined : index;
}

/**
 * How the camera frames the posters while the Projects panel is open (task 14). Since
 * task 27 the posters spread over all three floors, so the camera stands back past the
 * alley's kerb, about level with the first floor, and looks straight across at the whole
 * spread (every poster in view). Like the signs' view, it is aimed at the spread's centre,
 * behind the centred panel (task 18).
 */
export const POSTERS_VIEW = {
  polarRad: (80 * Math.PI) / 180,
  distanceM: 12,
} as const;

/** The centre of every poster slot's rectangle together, in wall coordinates. */
export function posterSpreadCentre(): { alongM: number; y: number } {
  const rects = posterKeepOut();
  const min = (f: (r: WallRect) => number) => Math.min(...rects.map(f));
  const max = (f: (r: WallRect) => number) => Math.max(...rects.map(f));
  return {
    alongM: (min((r) => r.minAlong) + max((r) => r.maxAlong)) / 2,
    y: (min((r) => r.minY) + max((r) => r.maxY)) / 2,
  };
}

/** Where the camera stops to look at the posters: the centre of their spread. */
export function postersViewPose(side: Side = GRAFFITI_SIDE): CameraPose {
  const centre = posterSpreadCentre();
  return {
    target: pointOnSide(side, centre.alongM, centre.y, LAYER_OUT_M.posters),
    orbit: {
      azimuthRad: sideAzimuthRad(side),
      polarRad: POSTERS_VIEW.polarRad,
      distanceM: POSTERS_VIEW.distanceM,
    },
  };
}

/**
 * The weathering's colours on the paint (task 22): dark, not multipliers, since the tag
 * layer is drawn colour. No yellow or amber: the rust is a dark red-brown.
 */
export const WEATHER_COLORS = {
  water: "#121217",
  rust: "#2e1511",
  /** The stain spreading under a sill. */
  sill: "#24130f",
} as const;

/** A grime run over the paint, in tag-layer pixels: it fades from the top down. */
export type WeatherStreak = {
  readonly rect: PixelRect;
  readonly color: string;
  readonly strength: number;
};

/**
 * The wall's water streaks and rust runs (`grimeMarks`) as they fall across the tag
 * layer, so the paint looks rained on too. Drawn only where there is paint (the wall's
 * own grime shows through the gaps).
 */
export function weatherStreaks(layout: GraffitiLayout): WeatherStreak[] {
  const streaks: WeatherStreak[] = [];
  for (const mark of grimeMarks(layout.side)) {
    if (mark.kind !== "streak") continue;
    const color = weatherColor(mark.tint);
    if (color === undefined) continue;
    const rect = wallPixelRect(layout.spot, layout.wallRect, {
      side: layout.side,
      minAlong: mark.along - mark.widthM / 2,
      maxAlong: mark.along + mark.widthM / 2,
      minY: mark.topY - mark.lengthM,
      maxY: mark.topY,
    });
    if (rect.width > 0 && rect.height > 0)
      streaks.push({ rect, color, strength: mark.strength * 0.7 });
  }
  return streaks;
}

function weatherColor(tint: TintId): string | undefined {
  if (tint === "water") return WEATHER_COLORS.water;
  if (tint === "rust") return WEATHER_COLORS.rust;
  return undefined;
}

/** A run of paint from a sill, in tag-layer pixels: from (`x`, `y`) down `lengthPx`. */
export type PaintRun = {
  readonly x: number;
  readonly y: number;
  readonly lengthPx: number;
  readonly widthPx: number;
  readonly color: string;
};

/** Stains and paint drips under one window's sill (task 20 review). */
export type SillDrip = {
  /** The stain: from the sill's underside down, the sill's width. */
  readonly stain: PixelRect;
  readonly runs: readonly PaintRun[];
};

export const SILL_DRIP_SEED = 0x51d1;

/** The paint run off the sills: the tags' neon colours, not the pale ones. */
export const SILL_DRIP_COLORS = TAG_COLORS.filter((token) => token !== "text");

/** How many of the wall's windows get drips. */
export const SILL_DRIP_WINDOWS = 4;

/**
 * A few of the back windows' sills with a dark stain spreading down from them and paint
 * run off them (someone tagged the sill, and the rain did the rest). Seeded; drawn over the
 * tags and under the posters.
 */
export function sillDrips(
  layout: GraffitiLayout,
  seed = SILL_DRIP_SEED,
): SillDrip[] {
  const rng = createRng(seed);
  const windows = wallOpenings().filter(
    (o) => o.side === layout.side && o.kind === "window",
  );
  // A seeded pick of a few windows, in wall order.
  const chosen = windows
    .map((o) => ({ o, key: rng.next() }))
    .sort((a, b) => a.key - b.key)
    .slice(0, SILL_DRIP_WINDOWS)
    .map((c) => c.o)
    .sort((a, b) => a.alongM - b.alongM);
  const pyPerM = layout.wallRect.height / (TAG_AREA.topY - TAG_AREA.bottomY);
  return chosen.map((o) => {
    const frame = openingRect(o);
    const sillY = o.bottomY - WINDOW.sillHeightM;
    const stain = wallPixelRect(layout.spot, layout.wallRect, {
      side: o.side,
      minAlong: frame.minAlong - WINDOW.sillOverhangM,
      maxAlong: frame.maxAlong + WINDOW.sillOverhangM,
      minY: sillY - rng.range(0.8, 1.6),
      maxY: sillY,
    });
    const count = rng.int(2, 5);
    const runs: PaintRun[] = [];
    for (let i = 0; i < count; i += 1) {
      const token = rng.pick(SILL_DRIP_COLORS) ?? "accent";
      runs.push({
        x: stain.x + rng.range(0.08, 0.92) * stain.width,
        y: stain.y,
        lengthPx: rng.range(0.3, 1.3) * pyPerM,
        widthPx: Math.max(2, rng.range(0.015, 0.035) * pyPerM),
        color: rng.next() < 0.3 ? WEATHER_COLORS.rust : PALETTE[token],
      });
    }
    return { stain, runs };
  });
}
