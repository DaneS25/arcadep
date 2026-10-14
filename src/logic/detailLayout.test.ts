import { describe, expect, it } from "vitest";
import {
  BUILDING,
  STREET,
  bandBoxes,
  buildingHeightM,
  interactionSpots,
  wallOpenings,
  sideNormal,
  sidewalkRect,
  type Box,
  type Vec3,
} from "./buildingLayout";
import { CAMERA } from "./cameraOrbit";
import { withDucts } from "./ductLayout";
import { neonStrips } from "./neonLayout";
import { skillSignsLayout } from "./skillSignsLayout";
import {
  DETAIL_SIZES,
  DETAIL_TEXTURE,
  BACK_CABLES,
  CABLE_HANG,
  backCableEnds,
  detailGeometryData,
  detailLayout,
  detailUv,
  roofTopY,
  sagPoints,
  signPlateVertices,
  VERTICES_PER_BOX,
  wallBox,
  withSignPlates,
  type DetailShades,
} from "./detailLayout";

const EPS = 1e-9;
const SHADES: DetailShades = {
  metal: 1,
  plate: 0.5,
  cable: 0.1,
  puddle: 0.05,
  face: 0,
  signPlate: 0.08,
  frame: 0.2,
  board: 0.4,
  door: 0.3,
  lamp: 0,
};

function corners(box: Box): Vec3[] {
  const out: Vec3[] = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1])
        out.push({
          x: box.centre.x + (sx * box.size.x) / 2,
          y: box.centre.y + (sy * box.size.y) / 2,
          z: box.centre.z + (sz * box.size.z) / 2,
        });
  return out;
}

function overlaps(a: Box, b: Box): boolean {
  return (["x", "y", "z"] as const).every(
    (axis) =>
      Math.abs(a.centre[axis] - b.centre[axis]) <
      (a.size[axis] + b.size[axis]) / 2 - EPS,
  );
}

/** The building's solid walls, up to the roof slab's top. */
const BUILDING_SOLID: Box = {
  centre: { x: 0, y: roofTopY() / 2, z: 0 },
  size: { x: BUILDING.widthM, y: roofTopY(), z: BUILDING.depthM },
};

/** Each side's interaction spot as a world box. */
function spotBoxes(): Box[] {
  return interactionSpots().map((spot) => {
    const n = sideNormal(spot.side);
    const alongX = n.x === 0;
    return {
      centre: spot.position,
      size: {
        x: alongX ? spot.size.x : spot.size.z,
        y: spot.size.y,
        z: alongX ? spot.size.z : spot.size.x,
      },
    };
  });
}

describe("sagPoints", () => {
  it("starts and ends on the given points and sags by the given amount at the middle", () => {
    const from = { x: 0, y: 10, z: 0 };
    const to = { x: 4, y: 10, z: 2 };
    const points = sagPoints(from, to, 0.5, 8);
    expect(points).toHaveLength(9);
    expect(points[0]).toEqual(from);
    expect(points[8]).toEqual(to);
    expect(points[4]?.y).toBeCloseTo(9.5, 9);
    for (const p of points) expect(p.y).toBeLessThanOrEqual(10 + EPS);
  });

  it("makes at least one segment", () => {
    expect(
      sagPoints({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 0, 0),
    ).toHaveLength(2);
  });
});

describe("wallBox", () => {
  it("puts a box against a side's wall, out by the gap", () => {
    const box = wallBox("left", 1, 2, { across: 1, up: 0.5, out: 0.4 }, 0.1);
    expect(box.centre.x).toBeCloseTo(-BUILDING.widthM / 2 - 0.1 - 0.2, 9);
    expect(box.centre.z).toBeCloseTo(1, 9);
    expect(box.centre.y).toBeCloseTo(2.25, 9);
    expect(box.size).toEqual({ x: 0.4, y: 0.5, z: 1 });
  });
});

describe("detailLayout", () => {
  const layout = detailLayout();

  it("has AC units, pipes, cables, vents, puddles and three signs", () => {
    const kinds = new Set(layout.boxes.map((b) => b.kind));
    for (const kind of ["metal", "plate", "puddle"] as const)
      expect(kinds.has(kind)).toBe(true);
    expect(layout.beams.some((b) => b.kind === "cable")).toBe(true);
    expect(new Set(layout.faces.map((f) => f.sign))).toEqual(
      new Set(["rooftop", "cafe", "arcade"]),
    );
  });

  it("hangs the alley's cables on the back wall, each end held by a bracket or hook", () => {
    const halfW = BUILDING.widthM / 2;
    const wallZ = -BUILDING.depthM / 2;
    const ends = backCableEnds();
    expect(ends).toHaveLength(BACK_CABLES.length);
    for (const { from, to } of ends)
      for (const end of [from, to]) {
        // On the back wall (or the parapet's face, flush with it), never out over the pavement.
        expect(end.z).toBeCloseTo(wallZ - CABLE_HANG.outM);
        expect(Math.abs(end.x)).toBeLessThan(halfW);
        expect(end.y).toBeGreaterThan(0);
        expect(end.y).toBeLessThan(buildingHeightM());
        const held = layout.boxes.some(
          ({ kind, box }) =>
            kind === "metal" &&
            box.size.x <= CABLE_HANG.bracket.across + EPS &&
            Math.abs(end.x - box.centre.x) <= box.size.x / 2 + EPS &&
            Math.abs(end.y - box.centre.y) <= box.size.y / 2 + EPS &&
            Math.abs(end.z - box.centre.z) <= box.size.z / 2 + EPS,
        );
        expect(held).toBe(true);
      }
  });

  it("runs the alley's cables clear of the back windows, doors and the floor band", () => {
    const openings = wallOpenings().filter((o) => o.side === "back");
    const bandYs = bandBoxes().map((b) => b.centre.y);
    for (const { from, to, sagM } of backCableEnds())
      for (const p of sagPoints(from, to, sagM, 40)) {
        // Back wall: along runs towards -x.
        const along = -p.x;
        for (const o of openings) {
          const inX = Math.abs(along - o.alongM) < o.widthM / 2 + 0.1;
          const inY =
            p.y > o.bottomY - 0.1 && p.y < o.bottomY + o.heightM + 0.1;
          expect(inX && inY).toBe(false);
        }
        for (const y of bandYs)
          expect(Math.abs(p.y - y)).toBeGreaterThan(
            BUILDING.bandHeightM / 2 + 0.1,
          );
      }
  });

  it("stands nothing out past the kerb: every prop, cable and tube stays over the pavement", () => {
    const walk = sidewalkRect();
    const kerb = STREET.kerbWidthM;
    const within = (p: Vec3): boolean =>
      p.x > walk.minX + kerb &&
      p.x < walk.maxX - kerb &&
      p.z > walk.minZ + kerb &&
      p.z < walk.maxZ - kerb;
    const all = withDucts(layout);
    for (const { box } of all.boxes)
      for (const c of corners(box)) expect(within(c)).toBe(true);
    for (const beam of all.beams) {
      expect(within(beam.from)).toBe(true);
      expect(within(beam.to)).toBe(true);
    }
    for (const strip of neonStrips())
      for (const c of corners(strip.box)) expect(within(c)).toBe(true);
  });

  it("keeps every prop out of the building's walls and off the interaction spots", () => {
    const spots = spotBoxes();
    for (const { box } of layout.boxes) {
      expect(overlaps(box, BUILDING_SOLID)).toBe(false);
      for (const spot of spots) expect(overlaps(box, spot)).toBe(false);
    }
  });

  it("puts the puddles on the pavement, inside the kerb and off the walls", () => {
    const walk = sidewalkRect();
    const k = STREET.kerbWidthM;
    let count = 0;
    for (const { kind, box } of layout.boxes) {
      if (kind !== "puddle") continue;
      count += 1;
      expect(box.centre.y - box.size.y / 2).toBeGreaterThan(STREET.curbHeightM);
      expect(box.size.y).toBe(DETAIL_SIZES.puddleM);
      expect(box.centre.x - box.size.x / 2).toBeGreaterThan(walk.minX + k);
      expect(box.centre.x + box.size.x / 2).toBeLessThan(walk.maxX - k);
      expect(box.centre.z - box.size.z / 2).toBeGreaterThan(walk.minZ + k);
      expect(box.centre.z + box.size.z / 2).toBeLessThan(walk.maxZ - k);
    }
    expect(count).toBeGreaterThanOrEqual(6);
  });

  it("stays where the orbiting camera can never reach", () => {
    // The camera is at least `minDistanceM` from its target and never lower than this.
    const lowest =
      CAMERA.target.y + CAMERA.minDistanceM * Math.cos(CAMERA.maxPolarRad);
    const points = [
      ...layout.boxes.flatMap((b) => corners(b.box)),
      ...layout.beams.flatMap((b) => [b.from, b.to]),
      ...layout.faces.flatMap((f) => f.quad.corners),
    ];
    for (const p of points) {
      const distance = Math.hypot(
        p.x - CAMERA.target.x,
        p.y - CAMERA.target.y,
        p.z - CAMERA.target.z,
      );
      expect(distance < CAMERA.minDistanceM - 0.5 || p.y < lowest - 0.5).toBe(
        true,
      );
    }
  });

  it("gives each sign face its atlas rectangle's shape, just in front of its plate", () => {
    for (const { sign, quad } of layout.faces) {
      const [bl, br, , tl] = quad.corners;
      const width = Math.hypot(br.x - bl.x, br.y - bl.y, br.z - bl.z);
      const height = Math.hypot(tl.x - bl.x, tl.y - bl.y, tl.z - bl.z);
      const rect = DETAIL_TEXTURE.rects[sign];
      expect(width / height).toBeCloseTo(rect.width / rect.height, 6);
      const plate = layout.boxes.find(
        ({ kind, box }) =>
          kind === "plate" &&
          quad.corners.every(
            (c) =>
              Math.abs(c.y - box.centre.y) <= box.size.y / 2 &&
              Math.abs(c.x - box.centre.x) <= box.size.x / 2 + 0.01 &&
              Math.abs(c.z - box.centre.z) <= box.size.z / 2 + 0.01,
          ),
      );
      if (plate === undefined) throw new Error(`no plate behind ${sign}`);
      // Every corner is just outside the plate, on the side the face looks out of.
      for (const c of quad.corners) {
        const out =
          (c.x - plate.box.centre.x) * quad.normal.x +
          (c.z - plate.box.centre.z) * quad.normal.z;
        const half =
          (Math.abs(quad.normal.x) * plate.box.size.x) / 2 +
          (Math.abs(quad.normal.z) * plate.box.size.z) / 2;
        expect(out - half).toBeGreaterThan(0);
        expect(out - half).toBeLessThan(0.01);
      }
    }
  });

  it("puts the rooftop name above the parapet, readable from the front and the alley", () => {
    const roof = layout.faces.filter((f) => f.sign === "rooftop");
    expect(roof.map((f) => f.quad.normal.z).sort()).toEqual([-1, 1]);
    const parapetTop = roofTopY() + BUILDING.parapetHeightM;
    for (const { quad } of roof)
      for (const c of quad.corners) expect(c.y).toBeGreaterThan(parapetTop);
    // Seen from its own side, the first corner (bottom-left) is on the viewer's left.
    for (const { quad } of roof) {
      const [bl, br] = quad.corners;
      const right = { x: br.x - bl.x, z: br.z - bl.z };
      // right × up must point along the normal: (rx, 0, rz) × (0, 1, 0) = (-rz, 0, rx).
      expect(
        -right.z * quad.normal.x + right.x * quad.normal.z,
      ).toBeGreaterThan(0);
    }
  });
});

describe("DETAIL_TEXTURE", () => {
  it("fits every rectangle inside the atlas without overlaps", () => {
    const rects = Object.values(DETAIL_TEXTURE.rects);
    for (const r of rects) {
      expect(r.x + r.width).toBeLessThanOrEqual(DETAIL_TEXTURE.widthPx);
      expect(r.y + r.height).toBeLessThanOrEqual(DETAIL_TEXTURE.heightPx);
    }
    rects.forEach((a, i) => {
      rects.slice(i + 1).forEach((b) => {
        const apart =
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y;
        expect(apart).toBe(true);
      });
    });
    expect(DETAIL_TEXTURE.widthPx).toBeLessThanOrEqual(1024);
  });

  it("maps a pixel rectangle to texture coordinates with v up", () => {
    expect(detailUv({ x: 0, y: 0, width: 1024, height: 512 })).toEqual({
      uMin: 0,
      uMax: 1,
      vMin: 0.5,
      vMax: 1,
    });
  });
});

describe("detailGeometryData", () => {
  const layout = detailLayout();
  const data = detailGeometryData(layout, 1, SHADES);
  const vertexCount =
    layout.boxes.length * 24 +
    layout.beams.length * 16 +
    layout.faces.length * 4;

  it("has one of every attribute per vertex and indexes only those vertices", () => {
    expect(data.positions).toHaveLength(vertexCount * 3);
    expect(data.normals).toHaveLength(vertexCount * 3);
    expect(data.uvs).toHaveLength(vertexCount * 2);
    expect(data.atlasUvs).toHaveLength(vertexCount * 2);
    expect(data.colors).toHaveLength(vertexCount * 3);
    expect(Math.max(...data.indices)).toBe(vertexCount - 1);
  });

  it("stays a light mesh", () => {
    expect(data.indices.length / 3).toBeLessThan(2500);
  });

  it("winds every triangle to face along its normal", () => {
    const at = (i: number): Vec3 => ({
      x: data.positions[i * 3] ?? 0,
      y: data.positions[i * 3 + 1] ?? 0,
      z: data.positions[i * 3 + 2] ?? 0,
    });
    for (let t = 0; t < data.indices.length; t += 3) {
      const [i0, i1, i2] = [
        data.indices[t] ?? 0,
        data.indices[t + 1] ?? 0,
        data.indices[t + 2] ?? 0,
      ];
      const p0 = at(i0);
      const p1 = at(i1);
      const p2 = at(i2);
      const e1 = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z };
      const e2 = { x: p2.x - p0.x, y: p2.y - p0.y, z: p2.z - p0.z };
      const n = {
        x: e1.y * e2.z - e1.z * e2.y,
        y: e1.z * e2.x - e1.x * e2.z,
        z: e1.x * e2.y - e1.y * e2.x,
      };
      const dot =
        n.x * (data.normals[i0 * 3] ?? 0) +
        n.y * (data.normals[i0 * 3 + 1] ?? 0) +
        n.z * (data.normals[i0 * 3 + 2] ?? 0);
      expect(dot).toBeGreaterThan(0);
    }
  });

  it("shades each part by its kind and maps only faces and puddles to lit atlas patches", () => {
    const dark = detailUv(DETAIL_TEXTURE.rects.dark);
    const inDark = (v: number): boolean => {
      const u = data.atlasUvs[v * 2] ?? -1;
      const w = data.atlasUvs[v * 2 + 1] ?? -1;
      return u > dark.uMin && u < dark.uMax && w > dark.vMin && w < dark.vMax;
    };
    let v = 0;
    for (const part of layout.boxes)
      for (let k = 0; k < 24; k += 1, v += 1) {
        expect(data.colors[v * 3]).toBe(SHADES[part.kind]);
        expect(inDark(v)).toBe(part.kind !== "puddle");
      }
    for (const beam of layout.beams)
      for (let k = 0; k < 16; k += 1, v += 1) {
        expect(data.colors[v * 3]).toBe(SHADES[beam.kind]);
        expect(inDark(v)).toBe(true);
      }
    for (let k = 0; k < layout.faces.length * 4; k += 1, v += 1) {
      expect(data.colors[v * 3]).toBe(SHADES.face);
      expect(inDark(v)).toBe(false);
    }
  });
});

describe("withSignPlates", () => {
  const base = detailLayout();
  const plates = skillSignsLayout(7).signs.map((sign) => sign.plate);
  const merged = withSignPlates(base, plates);

  it("adds the plates last among the boxes and leaves everything else as it was", () => {
    expect(merged.boxes.slice(0, base.boxes.length)).toEqual(base.boxes);
    expect(merged.boxes.slice(base.boxes.length)).toEqual(
      plates.map((box) => ({ kind: "signPlate", box })),
    );
    expect(merged.beams).toEqual(base.beams);
    expect(merged.faces).toEqual(base.faces);
  });

  it("finds the plates' vertices in the merged geometry, shaded and dark", () => {
    const range = signPlateVertices(merged);
    expect(range).toEqual({
      start: base.boxes.length * VERTICES_PER_BOX,
      count: plates.length * VERTICES_PER_BOX,
    });
    const data = detailGeometryData(merged, 1, SHADES);
    const dark = detailUv(DETAIL_TEXTURE.rects.dark);
    for (let v = range.start; v < range.start + range.count; v += 1) {
      expect(data.colors[v * 3]).toBe(SHADES.signPlate);
      const u = data.atlasUvs[v * 2] ?? -1;
      expect(u > dark.uMin && u < dark.uMax).toBe(true);
    }
    // The plates' boxes keep the world positions the layout gave them.
    const first = plates[0];
    if (first === undefined) throw new Error("no plates");
    const xs: number[] = [];
    for (let v = range.start; v < range.start + VERTICES_PER_BOX; v += 1)
      xs.push(data.positions[v * 3] ?? Number.NaN);
    expect(Math.min(...xs)).toBeCloseTo(first.centre.x - first.size.x / 2);
    expect(Math.max(...xs)).toBeCloseTo(first.centre.x + first.size.x / 2);
  });

  it("finds no plate vertices in a layout without plates", () => {
    expect(signPlateVertices(base)).toEqual({ start: 0, count: 0 });
  });
});
