import { describe, expect, it } from "vitest";
import { boxesGeometryData } from "./boxGeometry";
import {
  STREET,
  buildingFootprint,
  kerbBoxes,
  sidewalkBox,
  sidewalkRect,
  type Box,
  type Rect,
} from "./buildingLayout";
import { CAMERA, orbitPosition } from "./cameraOrbit";
import { detailLayout } from "./detailLayout";
import { SKY } from "./nightSky";
import {
  GROUND,
  SIDEWALK,
  SIDEWALK_GRIME,
  binBags,
  drainParts,
  drains,
  edgeDistanceM,
  groundRect,
  insideKerbRect,
  litter,
  litterKeepOut,
  rectsOverlap,
  sidewalkGrimeMarks,
  sidewalkGrimeUv,
  sidewalkGrimeUvs,
  sidewalkPixel,
  sidewalkProps,
  groundBox,
  groundFade,
  withSidewalk,
} from "./sidewalkLayout";

const walk = sidewalkRect();
const inner = insideKerbRect();
const fp = buildingFootprint();

const within = (r: Rect, outer: Rect, margin = 0): boolean =>
  r.minX >= outer.minX + margin &&
  r.maxX <= outer.maxX - margin &&
  r.minZ >= outer.minZ + margin &&
  r.maxZ <= outer.maxZ - margin;

const bottom = (box: Box): number => box.centre.y - box.size.y / 2;

describe("the ground past the kerb", () => {
  it("measures 0 on the pavement and the distance past its edge outside it", () => {
    expect(edgeDistanceM(0, 0)).toBe(0);
    expect(edgeDistanceM(walk.maxX, 0)).toBe(0);
    expect(edgeDistanceM(walk.maxX + 2, 0)).toBeCloseTo(2);
    expect(edgeDistanceM(0, walk.minZ - 1.5)).toBeCloseTo(1.5);
    expect(edgeDistanceM(walk.maxX + 3, walk.maxZ + 4)).toBeCloseTo(5);
  });

  it("is lit past the kerb and fades smoothly into the dark by the fade's end", () => {
    expect(groundFade(walk.maxX + GROUND.fadeStartM, 0)).toBe(1);
    // Well past the footpath it is still there: over half its light 15 m out.
    expect(groundFade(walk.maxX + 15, 0)).toBeGreaterThan(0.5);
    expect(groundFade(walk.maxX + GROUND.fadeEndM, 0)).toBe(0);
    expect(groundFade(walk.maxX + 200, 0)).toBe(0);
    let last = 1;
    for (let d = 0; d <= GROUND.fadeEndM; d += 0.5) {
      const f = groundFade(0, walk.maxZ + d);
      expect(f).toBeLessThanOrEqual(last + 1e-12);
      last = f;
    }
  });

  it("fades gently: no step of more than 6% a metre", () => {
    for (let d = 0; d < GROUND.fadeEndM; d += 0.25) {
      const step =
        groundFade(walk.maxX + d, 0) - groundFade(walk.maxX + d + 1, 0);
      expect(step).toBeLessThan(0.06);
    }
  });

  it("ends the ground slab where it is already black, top at y = 0, inside the sky", () => {
    const box = groundBox();
    expect(box.centre.y + box.size.y / 2).toBeCloseTo(0);
    const r = groundRect(box);
    expect(GROUND.slabM).toBeGreaterThan(GROUND.fadeEndM);
    for (const x of [r.minX, r.maxX])
      for (const z of [r.minZ, r.maxZ]) {
        expect(groundFade(x, z)).toBe(0);
        expect(Math.hypot(x, z)).toBeLessThan(SKY.radiusM);
      }
    expect(within(walk, r)).toBe(true);
  });

  it("has faded out before the slab's edge from every orbit at the farthest zoom", () => {
    // The camera sees the slab's edge only far behind the fade end: each orbit's ground
    // point still lies inside the slab, short of where the fade is complete.
    const r = groundRect(groundBox());
    for (let a = 0; a < 360; a += 15) {
      const p = orbitPosition({
        azimuthRad: (a * Math.PI) / 180,
        polarRad: CAMERA.maxPolarRad,
        distanceM: CAMERA.maxDistanceM,
      });
      expect(p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ).toBe(
        true,
      );
    }
  });
});

describe("drains", () => {
  it("lie flat on the pavement against the kerb stones, inside them", () => {
    expect(drains().length).toBeGreaterThanOrEqual(4);
    for (const d of drains()) {
      const parts = drainParts(d);
      for (const { box } of parts) {
        expect(bottom(box)).toBeGreaterThanOrEqual(STREET.curbHeightM);
        expect(bottom(box) + box.size.y).toBeLessThan(
          STREET.curbHeightM + 0.02,
        );
        expect(within(groundRect(box), inner)).toBe(true);
      }
      const frame = parts[0];
      expect(frame).toBeDefined();
      if (frame === undefined) continue;
      const r = groundRect(frame.box);
      const gap = Math.min(
        r.minX - inner.minX,
        inner.maxX - r.maxX,
        r.minZ - inner.minZ,
        inner.maxZ - r.maxZ,
      );
      expect(gap).toBeLessThan(0.05);
    }
  });
});

describe("litter and bin bags", () => {
  const items = litter();

  it("is the same every load", () => {
    expect(litter()).toEqual(items);
    expect(sidewalkGrimeMarks()).toEqual(sidewalkGrimeMarks());
  });

  it("scatters the full count, each piece lying on the pavement inside the kerb", () => {
    expect(items).toHaveLength(SIDEWALK.litterCount);
    for (const { box } of items) {
      expect(bottom(box)).toBeGreaterThan(STREET.curbHeightM);
      expect(bottom(box)).toBeLessThan(STREET.curbHeightM + 0.01);
      expect(within(groundRect(box), inner)).toBe(true);
    }
  });

  it("keeps litter off the walls, the doors, the spots, the puddles, the drains and each other", () => {
    const keepOut = litterKeepOut();
    const walls: Rect = {
      minX: fp.minX - SIDEWALK.wallClearM,
      maxX: fp.maxX + SIDEWALK.wallClearM,
      minZ: fp.minZ - SIDEWALK.wallClearM,
      maxZ: fp.maxZ + SIDEWALK.wallClearM,
    };
    items.forEach(({ box }, i) => {
      const r = groundRect(box);
      expect(rectsOverlap(r, walls)).toBe(false);
      for (const k of keepOut) expect(rectsOverlap(r, k)).toBe(false);
      items.forEach((other, j) => {
        if (j !== i) expect(rectsOverlap(r, groundRect(other.box))).toBe(false);
      });
    });
  });

  it("spreads the litter round every side of the building", () => {
    const sides = new Set(
      items.map(({ box }) => {
        const { x, z } = box.centre;
        if (z > fp.maxZ) return "front";
        if (z < fp.minZ) return "back";
        return x < 0 ? "left" : "right";
      }),
    );
    expect(sides.size).toBe(4);
  });

  it("stands the bin bags on the pavement behind the building, off the wall", () => {
    for (const { box } of binBags()) {
      expect(bottom(box)).toBeGreaterThanOrEqual(STREET.curbHeightM - 1e-9);
      const r = groundRect(box);
      expect(within(r, inner)).toBe(true);
      expect(r.maxZ).toBeLessThan(fp.minZ - 0.2);
    }
  });

  it("joins the details mesh after the layout's own parts", () => {
    const base = detailLayout();
    const joined = withSidewalk(base);
    expect(joined.boxes.slice(0, base.boxes.length)).toEqual(base.boxes);
    expect(joined.boxes.slice(base.boxes.length)).toEqual(sidewalkProps());
    expect(joined.beams).toEqual(base.beams);
    for (const { kind } of sidewalkProps())
      expect(["face", "lamp", "puddle", "signPlate"]).not.toContain(kind);
  });
});

describe("the pavement's grime texture", () => {
  it("holds the whole pavement and its kerbs", () => {
    for (const x of [walk.minX, walk.maxX])
      for (const z of [walk.minZ, walk.maxZ]) {
        const [u, v] = sidewalkGrimeUv(x, z);
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    // +x runs right on the canvas and +z down it.
    expect(sidewalkPixel(1, 0).x).toBeGreaterThan(sidewalkPixel(0, 0).x);
    expect(sidewalkPixel(0, 1).y).toBeGreaterThan(sidewalkPixel(0, 0).y);
    expect(SIDEWALK_GRIME.sizePx / SIDEWALK_GRIME.extentM).toBeGreaterThan(100);
  });

  it("maps every vertex of the pavement and kerbs from above", () => {
    const data = boxesGeometryData([sidewalkBox(), ...kerbBoxes()], 1.5);
    const uvs = sidewalkGrimeUvs(data);
    expect(uvs).toHaveLength((data.positions.length / 3) * 2);
    expect(uvs.every((c) => c >= 0 && c <= 1)).toBe(true);
  });

  it("marks the pavement with joints, cracks, patches, stains and wet rings", () => {
    const marks = sidewalkGrimeMarks();
    const count = (kind: string, tint?: string): number =>
      marks.filter(
        (m) =>
          m.kind === kind &&
          (tint === undefined || ("tint" in m && m.tint === tint)),
      ).length;
    expect(count("crack")).toBeGreaterThan(50);
    expect(count("line", "crack")).toBeGreaterThan(20);
    expect(count("stain", "water")).toBeGreaterThanOrEqual(8);
    expect(count("stain", "rust")).toBe(drains().length);
    expect(count("chip")).toBeGreaterThan(10);
    expect(count("line", "scratch")).toBeGreaterThan(10);
  });

  it("keeps every mark on the pavement (cracks stop at the kerb)", () => {
    const grown: Rect = {
      minX: walk.minX - 0.01,
      maxX: walk.maxX + 0.01,
      minZ: walk.minZ - 0.01,
      maxZ: walk.maxZ + 0.01,
    };
    for (const m of sidewalkGrimeMarks()) {
      const points: readonly (readonly [number, number])[] =
        m.kind === "stain"
          ? [[m.along, m.y]]
          : m.kind === "streak"
            ? [[m.along, m.topY]]
            : m.points;
      for (const [x, z] of points) {
        expect(x).toBeGreaterThanOrEqual(grown.minX);
        expect(x).toBeLessThanOrEqual(grown.maxX);
        expect(z).toBeGreaterThanOrEqual(grown.minZ);
        expect(z).toBeLessThanOrEqual(grown.maxZ);
      }
    }
  });
});
