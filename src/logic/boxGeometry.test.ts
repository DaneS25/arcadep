import { describe, expect, it } from "vitest";
import { BOX_FACES, boxesGeometryData, mergeGeometryData } from "./boxGeometry";
import type { Box, Vec3 } from "./buildingLayout";

const unit: Box = { centre: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } };

const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

const vec = (arr: readonly number[], i: number): Vec3 => ({
  x: arr[i * 3] ?? Number.NaN,
  y: arr[i * 3 + 1] ?? Number.NaN,
  z: arr[i * 3 + 2] ?? Number.NaN,
});

describe("BOX_FACES", () => {
  it("has right × up equal to the outward normal on every face", () => {
    for (const { n, r, u } of BOX_FACES) {
      const c = cross(r, u);
      expect(c.x).toBeCloseTo(n.x);
      expect(c.y).toBeCloseTo(n.y);
      expect(c.z).toBeCloseTo(n.z);
    }
  });
});

describe("boxesGeometryData", () => {
  it("gives each box 24 vertices and 12 triangles", () => {
    const data = boxesGeometryData([unit, unit], 1);
    expect(data.positions).toHaveLength(2 * 24 * 3);
    expect(data.normals).toHaveLength(2 * 24 * 3);
    expect(data.uvs).toHaveLength(2 * 24 * 2);
    expect(data.indices).toHaveLength(2 * 12 * 3);
    expect(Math.max(...data.indices)).toBe(2 * 24 - 1);
  });

  it("winds every triangle counter-clockwise seen from outside", () => {
    const box: Box = {
      centre: { x: 3, y: 2, z: -1 },
      size: { x: 4, y: 2, z: 6 },
    };
    const { positions, normals, indices } = boxesGeometryData([box], 1);
    for (let t = 0; t < indices.length; t += 3) {
      const a = vec(positions, indices[t] ?? 0);
      const b = vec(positions, indices[t + 1] ?? 0);
      const c = vec(positions, indices[t + 2] ?? 0);
      const face = cross(
        { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z },
        { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z },
      );
      const n = vec(normals, indices[t] ?? 0);
      expect(face.x * n.x + face.y * n.y + face.z * n.z).toBeGreaterThan(0);
    }
  });

  it("puts every vertex on the box's corners", () => {
    const box: Box = {
      centre: { x: 1, y: 5, z: 2 },
      size: { x: 2, y: 4, z: 6 },
    };
    const { positions } = boxesGeometryData([box], 1);
    for (let i = 0; i < positions.length / 3; i++) {
      const p = vec(positions, i);
      expect(Math.abs(p.x - 1)).toBeCloseTo(1);
      expect(Math.abs(p.y - 5)).toBeCloseTo(2);
      expect(Math.abs(p.z - 2)).toBeCloseTo(3);
    }
  });

  it("measures UVs in tiles of tileM, whatever the box size", () => {
    const wide: Box = {
      centre: { x: 0, y: 2, z: 0 },
      size: { x: 8, y: 4, z: 1 },
    };
    const { uvs } = boxesGeometryData([wide], 2);
    // The +z face is the fifth: u runs along x (8 m = 4 tiles), v along y (4 m = 2 tiles).
    const face = uvs.slice(4 * 4 * 2, 5 * 4 * 2);
    const us = face.filter((_, i) => i % 2 === 0);
    const vs = face.filter((_, i) => i % 2 === 1);
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(4);
    expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(2);
  });

  it("anchors UVs to the world, so neighbouring boxes tile without a seam", () => {
    const left: Box = {
      centre: { x: -1, y: 0.5, z: 0 },
      size: { x: 2, y: 1, z: 1 },
    };
    const right: Box = {
      centre: { x: 1, y: 0.5, z: 0 },
      size: { x: 2, y: 1, z: 1 },
    };
    // +z face corners: the left box's bottom-right meets the right box's bottom-left.
    const a = boxesGeometryData([left], 1).uvs.slice(32, 40);
    const b = boxesGeometryData([right], 1).uvs.slice(32, 40);
    expect(a[2]).toBeCloseTo(b[0] ?? Number.NaN);
    expect(a[3]).toBeCloseTo(b[1] ?? Number.NaN);
  });

  it("rejects a tile size that is not positive", () => {
    expect(() => boxesGeometryData([unit], 0)).toThrow(RangeError);
    expect(() => boxesGeometryData([unit], Number.NaN)).toThrow(RangeError);
  });
});

describe("mergeGeometryData", () => {
  it("keeps both parts and moves the second part's indices past the first's vertices", () => {
    const a = boxesGeometryData(
      [{ centre: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } }],
      1,
    );
    const b = boxesGeometryData(
      [{ centre: { x: 5, y: 0, z: 0 }, size: { x: 2, y: 1, z: 1 } }],
      1,
    );
    const m = mergeGeometryData(a, b);
    expect(m.positions).toEqual([...a.positions, ...b.positions]);
    expect(m.normals.length).toBe(a.normals.length + b.normals.length);
    expect(m.uvs.length).toBe(a.uvs.length + b.uvs.length);
    expect(m.indices.slice(0, a.indices.length)).toEqual(a.indices);
    expect(m.indices[a.indices.length]).toBe((b.indices[0] ?? 0) + 24);
    expect(Math.max(...m.indices)).toBe(m.positions.length / 3 - 1);
  });
});
