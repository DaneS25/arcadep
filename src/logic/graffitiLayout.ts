/**
 * The graffiti alley on the back side (task 12): a wall of procedural tags with a paste-up
 * poster per project on top. Since task 19 the tags cover the whole back wall from the
 * ground up into the second storey (`TAG_AREA`), while the posters stay in the back
 * interaction spot on the ground floor, which is also the only part picked. The tags and
 * every poster share one atlas canvas texture: the tag layer across the top band, then one
 * cell per poster below it. All the quads merge into one mesh (one draw call). Pure numbers
 * in metres and pixels; `scene/sides/graffitiWall.ts` builds the mesh and draws the atlas.
 *
 * Local coordinates as in `cabinetLayout`: `across` runs to the right of a visitor facing
 * the wall (0 at the spot's centre), `up` from the spot's bottom, `out` from the spot's
 * back face.
 */

import type { GeometryData } from "./boxGeometry";
import type { InteractionSpot, Side, Vec3 } from "./buildingLayout";
import {
  floorLevels,
  glassRects,
  pointOnSide,
  sideAzimuthRad,
  sideNormal,
  sideWidthM,
  type WallRect,
} from "./buildingLayout";
import { spotFor, toLocal, toWorld } from "./cabinetLayout";
import type { CameraPose } from "./cameraOrbit";
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

/** At most this many posters are pasted up; the Projects panel still lists every project. */
export const MAX_POSTERS = 8;

export const POSTER_SIZES = {
  /** Widest a poster gets. */
  maxWidthM: 1.1,
  /** Height over width, the same as an atlas cell. */
  aspect: GRAFFITI_TEXTURE.posterHeightPx / GRAFFITI_TEXTURE.posterWidthPx,
  /** Kept clear at each end of the wall. */
  marginM: 0.3,
  /** Least gap between neighbouring posters. */
  gapM: 0.2,
  /** Posters are pasted a little crooked, up to this much either way. */
  maxTiltRad: 0.06,
  /** Poster centres sit this high up the spot, give or take `upJitterM`. */
  centreUpM: 1.85,
  upJitterM: 0.15,
} as const;

/** Distance out from the spot's back face: the tags just off the wall, the posters over them. */
export const LAYER_OUT_M = {
  tags: 0.01,
  posters: 0.016,
  /** The invisible pick area, just in front of the posters. */
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
   * The picked area: the back spot (where the posters are), just in front of them. Clicks
   * on the rest of the graffiti do nothing, so only the poster row opens the Projects panel.
   */
  readonly pickArea: AtlasQuad;
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
 * Where `count` posters (capped at `MAX_POSTERS`) are pasted on the back spot: one row,
 * each in its own equal slot along the wall, a little crooked and a little up or down.
 * `seed` fixes the crookedness, so the wall looks the same on every load.
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
  const pickArea = quadAt(
    0,
    spot.size.y / 2,
    LAYER_OUT_M.pick,
    spot.size.x,
    spot.size.y,
    0,
    rectUv(wallRect),
  );

  const usable = spot.size.x - 2 * s.marginM;
  const slot = n > 0 ? usable / n : usable;
  // Wide enough to fill the slot, but turned at the steepest tilt it still leaves the gap.
  const worst = tiltedHalfExtents(1, s.aspect, s.maxTiltRad);
  const width = Math.min(s.maxWidthM, (slot - s.gapM) / (2 * worst.x));
  const height = width * s.aspect;

  const posters: PosterPlacement[] = [];
  for (let i = 0; i < n; i += 1) {
    const tiltRad = rng.range(-s.maxTiltRad, s.maxTiltRad);
    const half = tiltedHalfExtents(width, height, tiltRad);
    const slotCentre = -usable / 2 + slot * (i + 0.5);
    // Room to wander inside the slot, keeping half the gap clear at each edge.
    const freeAcross = Math.max(0, slot / 2 - s.gapM / 2 - half.x);
    const across = slotCentre + rng.range(-1, 1) * freeAcross;
    const freeUp = Math.max(0, Math.min(s.upJitterM, spot.size.y / 2 - half.y));
    const up = Math.min(
      spot.size.y - half.y,
      Math.max(half.y, s.centreUpM + rng.range(-1, 1) * freeUp),
    );
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

  const clearRects = glassRects(side).map((rect) =>
    wallPixelRect(spot, wallRect, rect),
  );

  return {
    side,
    id: spot.id,
    spot,
    wall,
    pickArea,
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
 * How the camera frames the posters while the Projects panel is open (task 14). Since the
 * tall alley wall came down (task 19) the camera no longer has to hang over the 4 m alley
 * looking steeply down: it stands back past the low wall at about head height of a first
 * floor window and looks across at the row. Like the signs' view, it is aimed at the row's
 * centre (`offsetAcrossM` 0, task 18), behind the centred panel.
 */
export const POSTERS_VIEW = {
  polarRad: (62 * Math.PI) / 180,
  distanceM: 7.5,
  offsetAcrossM: 0,
} as const;

/** Where the camera stops to look at the posters: the centre of their row. */
export function postersViewPose(side: Side = GRAFFITI_SIDE): CameraPose {
  const spot = spotFor(side);
  return {
    target: toWorld(
      spot,
      POSTERS_VIEW.offsetAcrossM,
      POSTER_SIZES.centreUpM,
      LAYER_OUT_M.posters,
    ),
    orbit: {
      azimuthRad: sideAzimuthRad(side),
      polarRad: POSTERS_VIEW.polarRad,
      distanceM: POSTERS_VIEW.distanceM,
    },
  };
}
