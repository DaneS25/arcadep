import type { Box, Vec3 } from "./buildingLayout";

/**
 * Vertex data for many axis-aligned boxes merged into one mesh, so a whole surface
 * (every wall, every trim band) is one draw call. Pure numbers; the scene wraps them in a
 * `BufferGeometry`.
 *
 * UVs are world-anchored and measured in texture tiles: `u` runs to the right and `v` up
 * as seen looking at each face, divided by `tileM`. Neighbouring boxes therefore tile
 * seamlessly, and a texture keeps its real-world size whatever the box size.
 */
export type GeometryData = {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly indices: number[];
};

type Face = {
  /** Outward normal. */
  readonly n: Vec3;
  /** Right and up as seen looking at the face; `r × u = n`, so the winding is counter-clockwise. */
  readonly r: Vec3;
  readonly u: Vec3;
};

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** The six faces of a box: +x, -x, +y, -y, +z, -z. */
export const BOX_FACES: readonly Face[] = [
  { n: v(1, 0, 0), r: v(0, 0, -1), u: v(0, 1, 0) },
  { n: v(-1, 0, 0), r: v(0, 0, 1), u: v(0, 1, 0) },
  { n: v(0, 1, 0), r: v(1, 0, 0), u: v(0, 0, -1) },
  { n: v(0, -1, 0), r: v(1, 0, 0), u: v(0, 0, 1) },
  { n: v(0, 0, 1), r: v(1, 0, 0), u: v(0, 1, 0) },
  { n: v(0, 0, -1), r: v(-1, 0, 0), u: v(0, 1, 0) },
];

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** Half the box's extent along a unit axis. */
const halfAlong = (box: Box, axis: Vec3): number =>
  Math.abs(dot(box.size, axis)) / 2;

/** Merged vertex data for `boxes`, with UVs in tiles of `tileM` metres. */
export function boxesGeometryData(
  boxes: readonly Box[],
  tileM: number,
): GeometryData {
  if (!(tileM > 0)) throw new RangeError("tileM must be positive");
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const box of boxes) {
    for (const { n, r, u } of BOX_FACES) {
      const base = positions.length / 3;
      const hn = halfAlong(box, n);
      const hr = halfAlong(box, r);
      const hu = halfAlong(box, u);
      // Corners in order: bottom-left, bottom-right, top-right, top-left.
      for (const [sr, su] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        const p = {
          x: box.centre.x + n.x * hn + r.x * sr * hr + u.x * su * hu,
          y: box.centre.y + n.y * hn + r.y * sr * hr + u.y * su * hu,
          z: box.centre.z + n.z * hn + r.z * sr * hr + u.z * su * hu,
        };
        positions.push(p.x, p.y, p.z);
        normals.push(n.x, n.y, n.z);
        uvs.push(dot(p, r) / tileM, dot(p, u) / tileM);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return { positions, normals, uvs, indices };
}
