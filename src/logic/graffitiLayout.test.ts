import { describe, expect, it } from "vitest";
import { interactionSpots, sideNormal, type Vec3 } from "./buildingLayout";
import {
  GRAFFITI_TEXTURE,
  LAYER_OUT_M,
  MAX_POSTERS,
  POSTER_SIZES,
  atlasQuadGeometryData,
  graffitiLayout,
  posterCell,
  rectUv,
  tiltedHalfExtents,
} from "./graffitiLayout";

const EPS = 1e-9;

function backSpot() {
  const spot = interactionSpots().find((s) => s.side === "back");
  if (spot === undefined) throw new Error("no back spot");
  return spot;
}

/** A world point in the back spot's local frame (the back wall faces -z; across runs -x). */
function local(p: Vec3): { across: number; up: number; out: number } {
  const spot = backSpot();
  return {
    across: -(p.x - spot.position.x),
    up: p.y - (spot.position.y - spot.size.y / 2),
    out: -(p.z - spot.position.z) + spot.size.z / 2,
  };
}

describe("posterCell and rectUv", () => {
  it("lays the cells out below the tag band without overlapping", () => {
    const cells = Array.from({ length: MAX_POSTERS }, (_, i) => posterCell(i));
    for (const cell of cells) {
      expect(cell.y).toBeGreaterThanOrEqual(GRAFFITI_TEXTURE.wallHeightPx);
      expect(cell.x + cell.width).toBeLessThanOrEqual(GRAFFITI_TEXTURE.widthPx);
      expect(cell.y + cell.height).toBeLessThanOrEqual(
        GRAFFITI_TEXTURE.heightPx,
      );
    }
    for (let a = 0; a < cells.length; a += 1)
      for (let b = a + 1; b < cells.length; b += 1) {
        const p = cells[a];
        const q = cells[b];
        if (p === undefined || q === undefined) throw new Error("no cell");
        const apart =
          p.x + p.width <= q.x ||
          q.x + q.width <= p.x ||
          p.y + p.height <= q.y ||
          q.y + q.height <= p.y;
        expect(apart).toBe(true);
      }
  });

  it("maps a rectangle to texture coordinates with v up", () => {
    expect(rectUv({ x: 0, y: 0, width: 1024, height: 384 })).toEqual({
      uMin: 0,
      uMax: 1,
      vMin: 0.625,
      vMax: 1,
    });
    expect(rectUv(posterCell(0))).toEqual({
      uMin: 0,
      uMax: 0.25,
      vMin: 1 - 704 / 1024,
      vMax: 1 - 384 / 1024,
    });
  });
});

describe("tiltedHalfExtents", () => {
  it("is half the size when straight and grows when turned", () => {
    expect(tiltedHalfExtents(2, 1, 0)).toEqual({ x: 1, y: 0.5 });
    const turned = tiltedHalfExtents(2, 1, 0.1);
    expect(turned.x).toBeGreaterThan(0.99);
    expect(turned.y).toBeGreaterThan(0.5);
  });
});

describe("graffitiLayout", () => {
  it("covers the whole back spot with the tag layer, just off the wall", () => {
    const layout = graffitiLayout(3, 1);
    const spot = backSpot();
    expect(layout.id).toBe("spot-back");
    const corners = layout.wall.corners.map(local);
    const across = corners.map((c) => c.across);
    const up = corners.map((c) => c.up);
    expect(Math.min(...across)).toBeCloseTo(-spot.size.x / 2);
    expect(Math.max(...across)).toBeCloseTo(spot.size.x / 2);
    expect(Math.min(...up)).toBeCloseTo(0);
    expect(Math.max(...up)).toBeCloseTo(spot.size.y);
    for (const c of corners) expect(c.out).toBeCloseTo(LAYER_OUT_M.tags);
    expect(layout.wall.normal).toEqual(sideNormal("back"));
  });

  it("is the same for the same seed", () => {
    expect(graffitiLayout(5, 42)).toEqual(graffitiLayout(5, 42));
  });

  it("pastes one poster per project, capped at the maximum", () => {
    expect(graffitiLayout(0, 1).posters).toHaveLength(0);
    expect(graffitiLayout(3, 1).posters).toHaveLength(3);
    expect(graffitiLayout(MAX_POSTERS + 4, 1).posters).toHaveLength(
      MAX_POSTERS,
    );
  });

  for (const count of [1, 2, 3, 5, MAX_POSTERS]) {
    for (const seed of [1, 7, 123]) {
      it(`keeps ${String(count)} posters (seed ${String(seed)}) inside the spot, apart and over the tags`, () => {
        const spot = backSpot();
        const { posters } = graffitiLayout(count, seed);
        const bounds = posters.map((poster) => {
          const pts = poster.quad.corners.map(local);
          for (const p of pts) {
            expect(p.across).toBeGreaterThanOrEqual(-spot.size.x / 2 - EPS);
            expect(p.across).toBeLessThanOrEqual(spot.size.x / 2 + EPS);
            expect(p.up).toBeGreaterThanOrEqual(-EPS);
            expect(p.up).toBeLessThanOrEqual(spot.size.y + EPS);
            expect(p.out).toBeCloseTo(LAYER_OUT_M.posters);
            expect(p.out).toBeGreaterThan(LAYER_OUT_M.tags);
            expect(p.out).toBeLessThanOrEqual(spot.size.z);
          }
          return {
            min: Math.min(...pts.map((p) => p.across)),
            max: Math.max(...pts.map((p) => p.across)),
          };
        });
        // Left to right, with at least the gap between neighbours.
        for (let i = 1; i < bounds.length; i += 1) {
          const prev = bounds[i - 1];
          const next = bounds[i];
          if (prev === undefined || next === undefined)
            throw new Error("no bounds");
          expect(next.min - prev.max).toBeGreaterThanOrEqual(
            POSTER_SIZES.gapM - 1e-6,
          );
        }
        for (const poster of posters) {
          expect(Math.abs(poster.tiltRad)).toBeLessThanOrEqual(
            POSTER_SIZES.maxTiltRad,
          );
          expect(poster.widthM).toBeLessThanOrEqual(POSTER_SIZES.maxWidthM);
          expect(poster.heightM / poster.widthM).toBeCloseTo(
            POSTER_SIZES.aspect,
          );
        }
      });
    }
  }

  it("maps each poster to its own atlas cell", () => {
    const { posters } = graffitiLayout(3, 1);
    posters.forEach((poster, i) => {
      expect(poster.cell).toEqual(posterCell(i));
      expect(poster.quad.uMin).toBe(rectUv(posterCell(i)).uMin);
    });
  });
});

describe("atlasQuadGeometryData", () => {
  it("builds four vertices and two triangles per quad with the quad's uvs", () => {
    const layout = graffitiLayout(2, 1);
    const quads = [layout.wall, ...layout.posters.map((p) => p.quad)];
    const data = atlasQuadGeometryData(quads);
    expect(data.positions).toHaveLength(quads.length * 4 * 3);
    expect(data.normals).toHaveLength(quads.length * 4 * 3);
    expect(data.uvs).toHaveLength(quads.length * 4 * 2);
    expect(data.indices).toHaveLength(quads.length * 6);
    const poster = layout.posters[0]?.quad;
    if (poster === undefined) throw new Error("no poster");
    // The first poster's bottom-left and top-right uvs.
    expect(data.uvs.slice(8, 10)).toEqual([poster.uMin, poster.vMin]);
    expect(data.uvs.slice(12, 14)).toEqual([poster.uMax, poster.vMax]);
  });
});
