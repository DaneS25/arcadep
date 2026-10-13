/**
 * The graffiti alley on the back side (task 12): a wall of procedural tags with a paste-up
 * poster per project on top, all inside the back interaction spot. The tags and every
 * poster share one atlas canvas texture: the tag layer across the top band, then one cell
 * per poster below it. All the quads merge into one mesh (one draw call). Pure numbers in
 * metres and pixels; `scene/sides/graffitiWall.ts` builds the mesh and draws the atlas.
 *
 * Local coordinates as in `cabinetLayout`: `across` runs to the right of a visitor facing
 * the wall (0 at the spot's centre), `up` from the spot's bottom, `out` from the spot's
 * back face.
 */

import type { GeometryData } from "./boxGeometry";
import type { InteractionSpot, Side, Vec3 } from "./buildingLayout";
import { sideNormal } from "./buildingLayout";
import { spotFor, toWorld } from "./cabinetLayout";
import { createRng } from "./rng";

export const GRAFFITI_SIDE: Side = "back";

/**
 * The atlas: 1024 x 1024 px (the 1K budget). The top 384 rows hold the tag layer (8:3,
 * like the 8 x 3 m spot); below it, 4 x 2 poster cells of 256 x 320 px (4:5, like a poster).
 */
export const GRAFFITI_TEXTURE = {
  widthPx: 1024,
  heightPx: 1024,
  wallHeightPx: 384,
  posterWidthPx: 256,
  posterHeightPx: 320,
  posterColumns: 4,
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
  /** The tag layer, covering the whole spot. */
  readonly wall: AtlasQuad;
  /** Its band of the atlas. */
  readonly wallRect: PixelRect;
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
  const wall = quadAt(
    0,
    spot.size.y / 2,
    LAYER_OUT_M.tags,
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

  return { side, id: spot.id, spot, wall, wallRect, posters };
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
