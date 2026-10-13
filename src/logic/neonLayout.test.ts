import { describe, expect, it } from "vitest";
import {
  BUILDING,
  interactionSpots,
  sideAzimuthRad,
  wallHeightM,
  type Box,
} from "./buildingLayout";
import { NEON, neonStrips } from "./neonLayout";

type Aabb = { min: readonly number[]; max: readonly number[] };

const aabb = (box: Box): Aabb => ({
  min: [
    box.centre.x - box.size.x / 2,
    box.centre.y - box.size.y / 2,
    box.centre.z - box.size.z / 2,
  ],
  max: [
    box.centre.x + box.size.x / 2,
    box.centre.y + box.size.y / 2,
    box.centre.z + box.size.z / 2,
  ],
});

const EPS = 1e-6;
const overlaps = (a: Aabb, b: Aabb): boolean =>
  [0, 1, 2].every(
    (i) =>
      (a.min[i] ?? 0) < (b.max[i] ?? 0) - EPS &&
      (b.min[i] ?? 0) < (a.max[i] ?? 0) - EPS,
  );

const building: Aabb = {
  min: [-BUILDING.widthM / 2, 0, -BUILDING.depthM / 2],
  max: [BUILDING.widthM / 2, wallHeightM(), BUILDING.depthM / 2],
};

describe("neonStrips", () => {
  const strips = neonStrips();

  it("has unique names and uses red as the main colour, with accents", () => {
    expect(new Set(strips.map((s) => s.name)).size).toBe(strips.length);
    const red = strips.filter((s) => s.color === "accent").length;
    expect(red).toBeGreaterThan(strips.length / 2);
    expect(strips.some((s) => s.color === "cyan")).toBe(true);
    expect(strips.some((s) => s.color === "purple")).toBe(true);
  });

  it("gives every tube the tube thickness across and a real length", () => {
    for (const { box } of strips) {
      const dims = [box.size.x, box.size.y, box.size.z].sort((a, b) => a - b);
      expect(dims[0]).toBeCloseTo(NEON.thicknessM);
      expect(dims[1]).toBeCloseTo(NEON.thicknessM);
      expect(dims[2]).toBeGreaterThan(1);
    }
  });

  it("keeps every tube outside the walls and above the street", () => {
    for (const { name, box } of strips) {
      expect(overlaps(aabb(box), building), name).toBe(false);
      expect(aabb(box).min[1], name).toBeGreaterThan(0);
    }
  });

  it("never covers an interaction marker", () => {
    const markers = interactionSpots().map((spot): Aabb => {
      // Marker sizes are in the side's frame; a quarter turn swaps x and z.
      const turned = Math.abs(Math.sin(sideAzimuthRad(spot.side))) > 0.5;
      const size = turned
        ? { x: spot.size.z, y: spot.size.y, z: spot.size.x }
        : spot.size;
      return aabb({ centre: spot.position, size });
    });
    for (const { name, box } of strips)
      for (const marker of markers)
        expect(overlaps(aabb(box), marker), name).toBe(false);
  });

  it("is the same every call", () => {
    expect(neonStrips()).toEqual(strips);
  });
});
