/** The merged details mesh's vertex data and the vertex ranges the scene swaps (task 39 split). */

import { boxesGeometryData, type GeometryData } from "./boxGeometry";
import type { Box, Vec3 } from "./buildingLayout";
import {
  DETAIL_TEXTURE,
  WINDOW_CELLS,
  centreUv,
  cornerUvs,
  detailUv,
  glowUvs,
} from "./detailAtlas";
import type { DetailBox, DetailKind, DetailLayout } from "./detailTypes";

/** Vertex data for the merged details mesh: the usual geometry plus the atlas UVs and shades. */
export type DetailGeometryData = GeometryData & {
  /** Second UV set, into the atlas (the emissive map). */
  readonly atlasUvs: number[];
  /** RGB vertex colours: each part's grey shade. */
  readonly colors: number[];
};

/** Grey shade per kind, multiplying the metal colour or texture. */
export type DetailShades = Readonly<Record<DetailKind, number>>;

type Vec = Vec3;
const sub = (a: Vec, b: Vec): Vec => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const cross = (a: Vec, b: Vec): Vec => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const scale = (a: Vec, k: number): Vec => ({
  x: a.x * k,
  y: a.y * k,
  z: a.z * k,
});
const unit = (a: Vec): Vec => {
  const length = Math.hypot(a.x, a.y, a.z);
  return length > 0 ? scale(a, 1 / length) : { x: 0, y: 1, z: 0 };
};

/**
 * The layout with the skill signs' backing plates added at the end of its boxes (task 15):
 * they join the details mesh, so the signs cost one draw call (their faces) instead of two.
 */
export function withSignPlates(
  layout: DetailLayout,
  plates: readonly Box[],
): DetailLayout {
  return {
    ...layout,
    boxes: [
      ...layout.boxes,
      ...plates.map((box): DetailBox => ({ kind: "signPlate", box })),
    ],
  };
}

/** Vertices per beam in `detailGeometryData` (4 sides of 4 corners), after the boxes. */
export const VERTICES_PER_BEAM = 16;

/** The first vertex of each face in `detailGeometryData`'s output (four each), after the boxes and beams. */
export function faceVertexStarts(layout: DetailLayout): number[] {
  const first =
    layout.boxes.length * VERTICES_PER_BOX +
    layout.beams.length * VERTICES_PER_BEAM;
  return layout.faces.map((_, i) => first + i * 4);
}

/** Vertices per box in `boxesGeometryData` (6 faces of 4 corners); boxes come first. */
export const VERTICES_PER_BOX = 24;

/**
 * The vertices of the sign plates in `detailGeometryData`'s output, so the scene can
 * switch their atlas UVs on hover. `withSignPlates` puts them last among the boxes.
 */
export function signPlateVertices(layout: DetailLayout): {
  readonly start: number;
  readonly count: number;
} {
  const first = layout.boxes.findIndex((part) => part.kind === "signPlate");
  if (first < 0) return { start: 0, count: 0 };
  const count = layout.boxes.length - first;
  return { start: first * VERTICES_PER_BOX, count: count * VERTICES_PER_BOX };
}

/**
 * The first vertex of each window pane in `detailGeometryData`'s output (four each), so the
 * scene can swap a flickering pane's atlas UVs. Panes come after boxes, beams and faces.
 */
export function glassVertexStarts(layout: DetailLayout): number[] {
  const first =
    layout.boxes.length * VERTICES_PER_BOX +
    layout.beams.length * 16 +
    layout.faces.length * 4;
  return layout.glass.map((_, i) => first + i * 4);
}

/**
 * Merged vertex data for the whole layout. Boxes keep `boxesGeometryData`'s world UVs
 * (tiles of `tileM`); beams get four side faces each (their ends are too thin to see);
 * faces are quads mapped to their atlas rectangle. Puddles map the whole puddle patch on
 * every face, lamp bulbs the middle of the lamp patch, the generator's slits the middle of
 * the glow patch; everything else samples the black patch.
 */
export function detailGeometryData(
  layout: DetailLayout,
  tileM: number,
  shades: DetailShades,
): DetailGeometryData {
  const base = boxesGeometryData(
    layout.boxes.map((part) => part.box),
    tileM,
  );
  const positions = [...base.positions];
  const normals = [...base.normals];
  const uvs = [...base.uvs];
  const indices = [...base.indices];
  const atlasUvs: number[] = [];
  const colors: number[] = [];

  const dark = centreUv(DETAIL_TEXTURE.rects.dark);
  const lamp = centreUv(DETAIL_TEXTURE.rects.lamp);
  const glow = centreUv(DETAIL_TEXTURE.rects.glow);
  const wireSheen = centreUv(DETAIL_TEXTURE.rects.wireSheen);
  const glows = glowUvs();
  const puddle = detailUv(DETAIL_TEXTURE.rects.puddle);
  const puddleCorners: [number, number][] = [
    [puddle.uMin, puddle.vMin],
    [puddle.uMax, puddle.vMin],
    [puddle.uMax, puddle.vMax],
    [puddle.uMin, puddle.vMax],
  ];
  const shade = (kind: DetailKind): void => {
    const s = shades[kind];
    colors.push(s, s, s);
  };

  // 6 faces of 4 corners per box, in boxesGeometryData's order.
  for (const part of layout.boxes)
    for (let face = 0; face < 6; face += 1)
      for (let corner = 0; corner < 4; corner += 1) {
        const uv =
          part.kind === "puddle"
            ? puddleCorners[corner]
            : part.kind === "lamp"
              ? lamp
              : part.kind === "glow"
                ? glow
                : part.kind === "led" || part.kind === "light"
                  ? glows[part.glow ?? "red"]
                  : dark;
        atlasUvs.push(...(uv ?? dark));
        shade(part.kind);
      }

  for (const beam of layout.beams) {
    const d = unit(sub(beam.to, beam.from));
    const helper =
      Math.abs(d.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const a = unit(cross(d, helper));
    const b = cross(d, a);
    const h = beam.thicknessM / 2;
    const length = Math.hypot(
      beam.to.x - beam.from.x,
      beam.to.y - beam.from.y,
      beam.to.z - beam.from.z,
    );
    for (const n of [a, b, scale(a, -1), scale(b, -1)]) {
      // Right as seen looking at the face, so `r × d = n` and the winding faces out.
      const r = cross(d, n);
      const first = positions.length / 3;
      for (const [sr, end] of [
        [-1, 0],
        [1, 0],
        [1, 1],
        [-1, 1],
      ] as const) {
        const p = end === 0 ? beam.from : beam.to;
        positions.push(
          p.x + n.x * h + r.x * sr * h,
          p.y + n.y * h + r.y * sr * h,
          p.z + n.z * h + r.z * sr * h,
        );
        normals.push(n.x, n.y, n.z);
        uvs.push((sr * h) / tileM, (end * length) / tileM);
        atlasUvs.push(...(beam.kind === "wire" ? wireSheen : dark));
        shade(beam.kind);
      }
      indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
  }

  for (const { quad } of layout.faces) {
    const first = positions.length / 3;
    const corners: [number, number][] = [
      [quad.uMin, quad.vMin],
      [quad.uMax, quad.vMin],
      [quad.uMax, quad.vMax],
      [quad.uMin, quad.vMax],
    ];
    quad.corners.forEach((c, i) => {
      positions.push(c.x, c.y, c.z);
      normals.push(quad.normal.x, quad.normal.y, quad.normal.z);
      uvs.push(0, 0);
      atlasUvs.push(...(corners[i] ?? dark));
      shade("face");
    });
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }

  // Window panes: black under their glow, like the sign faces.
  for (const pane of layout.glass) {
    const first = positions.length / 3;
    const corners = cornerUvs(WINDOW_CELLS[pane.cell]);
    pane.quad.corners.forEach((c, i) => {
      positions.push(c.x, c.y, c.z);
      normals.push(pane.quad.normal.x, pane.quad.normal.y, pane.quad.normal.z);
      uvs.push(0, 0);
      atlasUvs.push(...(corners[i] ?? dark));
      shade("face");
    });
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }

  return { positions, normals, uvs, indices, atlasUvs, colors };
}
