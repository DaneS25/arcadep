import { describe, expect, it } from "vitest";
import {
  BUILDING,
  SIDES,
  STREET,
  buildingHeightM,
  interactionSpots,
  openingRect,
  pavementY,
  sideNormal,
  sideOffsetM,
  sideTangent,
  sidewalkRect,
  wallOpenings,
  type Box,
  type Side,
  type Vec3,
} from "./buildingLayout";
import { cabinetLayout } from "./cabinetLayout";
import { CAMERA, orbitPosition, posePosition } from "./cameraOrbit";
import { CLOSE_UP_SIDES, stopPose } from "./cameraStops";
import { relativeLuminance } from "./contrast";
import {
  DETAIL_TEXTURE,
  detailLayout,
  roofTopY,
  withSignPlates,
} from "./detailLayout";
import { withDucts } from "./ductLayout";
import {
  GENERATOR,
  generatorFootprint,
  generatorLayout,
  generatorPlugs,
  generatorWallRect,
  housingTopY,
  withGenerator,
} from "./generatorLayout";
import { MAX_POSTERS, graffitiLayout } from "./graffitiLayout";
import { BLOOM, DETAILS_LOOK, GENERATOR_LOOK } from "./lookConfig";
import { neonStrips } from "./neonLayout";
import { rectsOverlap, sidewalkProps } from "./sidewalkLayout";
import { skillSignsLayout } from "./skillSignsLayout";
import { terminalLayout } from "./terminalLayout";
import { windowLayout } from "./windowLayout";

const EPS = 1e-9;
const DEG = Math.PI / 180;
const SIDE: Side = GENERATOR.side;

function overlaps(a: Box, b: Box): boolean {
  return (["x", "y", "z"] as const).every(
    (axis) =>
      Math.abs(a.centre[axis] - b.centre[axis]) <
      (a.size[axis] + b.size[axis]) / 2 - EPS,
  );
}

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

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.z * b.z;

/** A box's along/up extents on the generator's wall and its out range from the wall. */
function onWall(box: Box) {
  const t = sideTangent(SIDE);
  const n = sideNormal(SIDE);
  const along = dot(box.centre, t);
  const ha = Math.abs(dot(box.size, t)) / 2;
  const out = dot(box.centre, n) - sideOffsetM(SIDE);
  const ho = Math.abs(dot(box.size, n)) / 2;
  return {
    minAlong: along - ha,
    maxAlong: along + ha,
    minY: box.centre.y - box.size.y / 2,
    maxY: box.centre.y + box.size.y / 2,
    nearOut: out - ho,
    farOut: out + ho,
  };
}

/** Whether the segment from `a` to `b` passes through `box` grown by `margin` (slab test). */
function segmentHits(a: Vec3, b: Vec3, box: Box, margin = 0): boolean {
  let t0 = 0;
  let t1 = 1;
  for (const axis of ["x", "y", "z"] as const) {
    const d = b[axis] - a[axis];
    const lo = box.centre[axis] - box.size[axis] / 2 - margin;
    const hi = box.centre[axis] + box.size[axis] / 2 + margin;
    if (Math.abs(d) < 1e-12) {
      if (a[axis] < lo || a[axis] > hi) return false;
      continue;
    }
    let ta = (lo - a[axis]) / d;
    let tb = (hi - a[axis]) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

const gen = generatorLayout();
const GEN_BOXES = gen.boxes.map((part) => part.box);

/** The building's walls and roof, a hair inside its faces, so props on them aren't hidden. */
const BUILDING_SOLID: Box = {
  centre: { x: 0, y: buildingHeightM() / 2, z: 0 },
  size: {
    x: BUILDING.widthM - 0.02,
    y: buildingHeightM(),
    z: BUILDING.depthM - 0.02,
  },
};

describe("generatorLayout", () => {
  it("is a giant block standing on the left pavement, against the wall", () => {
    const parts = gen.boxes.map((part) => onWall(part.box));
    const minY = Math.min(...parts.map((r) => r.minY));
    const maxY = Math.max(...parts.map((r) => r.maxY));
    const minAlong = Math.min(...parts.map((r) => r.minAlong));
    const maxAlong = Math.max(...parts.map((r) => r.maxAlong));
    const farOut = Math.max(...parts.map((r) => r.farOut));
    // On the pavement, taller than a door, wider than two, as deep as a car is wide.
    expect(minY).toBeCloseTo(pavementY(), 9);
    expect(maxY - minY).toBeGreaterThan(3);
    expect(maxAlong - minAlong).toBeGreaterThan(2.5);
    expect(farOut).toBeGreaterThan(1.2);
    // Not detached: the housing, the skid and the feed duct all touch the wall.
    const touching = parts.filter((r) => Math.abs(r.nearOut) < EPS);
    expect(touching.length).toBeGreaterThanOrEqual(3);
    for (const r of parts) expect(r.nearOut).toBeGreaterThan(-EPS);
    // Heavy housings, fins, ports and cold slits, and two stencils.
    const kinds = new Set(gen.boxes.map((part) => part.kind));
    for (const kind of ["metal", "plate", "frame", "cable", "glow"] as const)
      expect(kinds.has(kind)).toBe(true);
    const fins = gen.boxes.filter(
      ({ box }) => box.size.y === GENERATOR.fins.upM,
    );
    expect(fins).toHaveLength(GENERATOR.fins.count);
    expect(gen.faces).toHaveLength(2);
  });

  it("stays on the pavement inside the kerb, leaving room to walk past", () => {
    const walk = sidewalkRect();
    const k = STREET.kerbWidthM;
    for (const c of GEN_BOXES.flatMap(corners)) {
      expect(c.x).toBeGreaterThan(walk.minX + k + 1);
      expect(c.z).toBeGreaterThan(walk.minZ + k);
      expect(c.z).toBeLessThan(walk.maxZ - k);
    }
  });

  it("covers no window, door, sign, neon tube or spot on its wall", () => {
    for (const { box } of gen.boxes) {
      const r = onWall(box);
      for (const o of wallOpenings().filter((x) => x.side === SIDE)) {
        // Frames and the sills' overhang.
        const w = openingRect(o);
        expect(
          r.maxAlong <= w.minAlong - 0.08 + EPS ||
            r.minAlong >= w.maxAlong + 0.08 - EPS ||
            r.maxY <= w.minY - 0.08 ||
            r.minY >= w.maxY,
          JSON.stringify(r),
        ).toBe(true);
      }
    }
    // Well under the skill signs and the cyan band tube.
    const signsBottom = Math.min(
      ...skillSignsLayout(12).signs.map(
        (s) => s.plate.centre.y - s.plate.size.y / 2,
      ),
    );
    const tubes = neonStrips().filter((s) => s.name === "left-band");
    const lowestTube = Math.min(
      ...tubes.map((s) => s.box.centre.y - s.box.size.y / 2),
    );
    const top = generatorWallRect().maxY;
    expect(top).toBeLessThan(signsBottom - 1);
    expect(top).toBeLessThan(lowestTube - 0.3);
  });

  it("keeps out of the walls and off every other prop, window, sign, tube, spot and pavement prop", () => {
    const spots = interactionSpots().map((spot): Box => {
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
    const walls: Box = {
      centre: { x: 0, y: roofTopY() / 2, z: 0 },
      size: { x: BUILDING.widthM, y: roofTopY(), z: BUILDING.depthM },
    };
    const others: Box[] = [
      ...withDucts(detailLayout()).boxes.map((part) => part.box),
      ...windowLayout().boxes.map((part) => part.box),
      ...neonStrips().map((strip) => strip.box),
      ...skillSignsLayout(12).signs.map((sign) => sign.plate),
      ...sidewalkProps().map((part) => part.box),
      ...cabinetLayout().parts,
      ...terminalLayout().parts,
      ...spots,
    ];
    for (const box of GEN_BOXES) {
      expect(overlaps(box, walls)).toBe(false);
      for (const other of others)
        expect(overlaps(box, other), JSON.stringify(other)).toBe(false);
    }
  });

  it("keeps the litter off its skid", () => {
    const foot = generatorFootprint();
    for (const part of sidewalkProps()) {
      const b = part.box;
      expect(
        rectsOverlap(foot, {
          minX: b.centre.x - b.size.x / 2,
          maxX: b.centre.x + b.size.x / 2,
          minZ: b.centre.z - b.size.z / 2,
          maxZ: b.centre.z + b.size.z / 2,
        }),
      ).toBe(false);
    }
  });

  it("stays where the orbiting camera can never reach", () => {
    const lowest =
      CAMERA.target.y + CAMERA.minDistanceM * Math.cos(CAMERA.maxPolarRad);
    for (const p of GEN_BOXES.flatMap(corners))
      expect(p.y).toBeLessThan(lowest - 0.5);
  });

  it("puts its warning stencils just proud of the housing, facing out, square like their patch", () => {
    const rect = DETAIL_TEXTURE.rects.stencil;
    for (const { sign, quad } of gen.faces) {
      expect(sign).toBe("stencil");
      const [bl, br, , tl] = quad.corners;
      const width = Math.hypot(br.x - bl.x, br.y - bl.y, br.z - bl.z);
      const height = Math.hypot(tl.x - bl.x, tl.y - bl.y, tl.z - bl.z);
      expect(width / height).toBeCloseTo(rect.width / rect.height, 6);
      // Bottom-left to bottom-right is the viewer's right: right × up = normal.
      const right = { x: br.x - bl.x, z: br.z - bl.z };
      expect(
        -right.z * quad.normal.x + right.x * quad.normal.z,
      ).toBeGreaterThan(0);
      // Each sits on a housing face, a few millimetres out from it.
      const backing = gen.boxes.find(({ kind, box }) => {
        if (kind !== "metal") return false;
        return quad.corners.every((c) => {
          const out =
            (c.x - box.centre.x) * quad.normal.x +
            (c.z - box.centre.z) * quad.normal.z;
          const half =
            (Math.abs(quad.normal.x) * box.size.x) / 2 +
            (Math.abs(quad.normal.z) * box.size.z) / 2;
          const inY = Math.abs(c.y - box.centre.y) < box.size.y / 2;
          return inY && out - half > 0 && out - half < 0.01;
        });
      });
      expect(backing).toBeDefined();
    }
  });

  it("glows a dim cold colour, never yellow or amber, and never blooms", () => {
    const hue = (hex: string): { hue: number; sat: number } => {
      const [r, g, b] = [1, 3, 5].map(
        (i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255,
      ) as [number, number, number];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      const d = max - min;
      if (d === 0) return { hue: 0, sat: 0 };
      const sat = d / (1 - Math.abs(2 * l - 1));
      const h =
        max === r
          ? ((g - b) / d) % 6
          : max === g
            ? (b - r) / d + 2
            : (r - g) / d + 4;
      return { hue: (h * 60 + 360) % 360, sat };
    };
    const glow = hue(GENERATOR_LOOK.glow);
    // Cold: cyan to blue.
    expect(glow.hue).toBeGreaterThan(170);
    expect(glow.hue).toBeLessThan(250);
    for (const hex of Object.values(GENERATOR_LOOK)) {
      const { hue: h, sat } = hue(hex);
      if (sat > 0.3) expect(h < 15 || h > 75, hex).toBe(true);
      const lit =
        (relativeLuminance(hex) ?? Number.NaN) * DETAILS_LOOK.emissiveIntensity;
      expect(lit).toBeLessThan(BLOOM.threshold / 3);
    }
  });
});

describe("generatorPlugs", () => {
  const plugs = generatorPlugs();

  it("leaves several ports on its top for task 29's wires, each pointing straight up", () => {
    expect(plugs.length).toBeGreaterThanOrEqual(4);
    expect(new Set(plugs.map((p) => p.id)).size).toBe(plugs.length);
    for (const plug of plugs) {
      expect(plug.direction).toEqual({ x: 0, y: 1, z: 0 });
      expect(plug.sizeM).toBeGreaterThan(0.1);
      expect(plug.position.y).toBeGreaterThan(housingTopY());
      // On top of a port collar, its dark mouth just under it.
      const collar = gen.boxes.find(
        ({ kind, box }) =>
          kind === "metal" &&
          Math.abs(box.centre.x - plug.position.x) < EPS &&
          Math.abs(box.centre.z - plug.position.z) < EPS &&
          Math.abs(dot(box.size, sideTangent(SIDE)) - plug.sizeM) < EPS,
      );
      expect(collar).toBeDefined();
      const top = (collar?.box.centre.y ?? 0) + (collar?.box.size.y ?? 0) / 2;
      expect(plug.position.y - top).toBeGreaterThan(0);
      expect(plug.position.y - top).toBeLessThan(0.02);
    }
  });

  it("has a clear run up from every port to above the generator", () => {
    const others = [
      ...GEN_BOXES,
      ...withDucts(detailLayout()).boxes.map((part) => part.box),
      ...windowLayout().boxes.map((part) => part.box),
    ];
    const top = generatorWallRect().maxY + 0.2;
    for (const plug of plugs) {
      const from = { ...plug.position, y: plug.position.y + 0.001 };
      const to = { ...plug.position, y: top };
      for (const box of others) expect(segmentHits(from, to, box)).toBe(false);
    }
  });
});

describe("the generator in every view", () => {
  /** Points on everything the visitor must always see: clickables, signs and doors. */
  const quadPoints = (q: {
    corners: readonly Vec3[];
    normal: Vec3;
  }): Vec3[] => {
    const n = q.corners.length;
    const mid = q.corners.reduce(
      (m, c) => ({ x: m.x + c.x / n, y: m.y + c.y / n, z: m.z + c.z / n }),
      { x: 0, y: 0, z: 0 },
    );
    const off = (p: Vec3): Vec3 => ({
      x: p.x + q.normal.x * 0.02,
      y: p.y + q.normal.y * 0.02,
      z: p.z + q.normal.z * 0.02,
    });
    return [
      off(mid),
      ...q.corners.map((c) =>
        off({
          x: mid.x + (c.x - mid.x) * 0.9,
          y: mid.y + (c.y - mid.y) * 0.9,
          z: mid.z + (c.z - mid.z) * 0.9,
        }),
      ),
    ];
  };
  const doorQuads = wallOpenings()
    .filter((o) => o.kind === "door")
    .map((o) => {
      const r = openingRect(o);
      const n = sideNormal(o.side);
      const t = sideTangent(o.side);
      const at = (a: number, y: number): Vec3 => ({
        x: n.x * (sideOffsetM(o.side) + 0.05) + t.x * a,
        y,
        z: n.z * (sideOffsetM(o.side) + 0.05) + t.z * a,
      });
      return {
        corners: [
          at(r.minAlong, r.minY),
          at(r.maxAlong, r.minY),
          at(r.maxAlong, r.maxY),
          at(r.minAlong, r.maxY),
        ],
        normal: n,
      };
    });
  const TARGETS: Vec3[] = [
    ...cabinetLayout().faces.flatMap(quadPoints),
    ...terminalLayout().faces.flatMap(quadPoints),
    ...skillSignsLayout(12).signs.flatMap((s) => quadPoints(s.quad)),
    ...graffitiLayout(MAX_POSTERS, 1).posters.flatMap((p) =>
      quadPoints(p.quad),
    ),
    ...detailLayout().faces.flatMap((f) => quadPoints(f.quad)),
    ...doorQuads.flatMap(quadPoints),
  ];

  const CAMERAS: Vec3[] = [
    ...SIDES.map((side) => posePosition(stopPose({ kind: "side", side }))),
    ...CLOSE_UP_SIDES.map((side) =>
      posePosition(stopPose({ kind: "closeUp", side })),
    ),
    orbitPosition(CAMERA.start),
  ];
  for (let az = 0; az < 360; az += 10)
    for (const polarRad of [
      CAMERA.minPolarRad,
      45 * DEG,
      CAMERA.sidePolarRad,
      72 * DEG,
      CAMERA.maxPolarRad,
    ])
      for (const distanceM of [
        CAMERA.minDistanceM,
        20,
        CAMERA.sideDistanceM,
        CAMERA.maxDistanceM,
      ])
        CAMERAS.push(
          orbitPosition({ azimuthRad: az * DEG, polarRad, distanceM }),
        );

  it("hides no door, sign, poster, the cabinet or the terminal from any camera stop or orbit", () => {
    let checked = 0;
    let blocked = 0;
    for (const camera of CAMERAS)
      for (const target of TARGETS) {
        // Only sight lines the building itself doesn't already cut.
        if (segmentHits(camera, target, BUILDING_SOLID)) continue;
        checked += 1;
        if (GEN_BOXES.some((box) => segmentHits(camera, target, box, 0.05)))
          blocked += 1;
      }
    expect(checked).toBeGreaterThan(10000);
    expect(blocked).toBe(0);
  });

  it("is itself in plain view from the left side's stop", () => {
    const camera = posePosition(stopPose({ kind: "side", side: "left" }));
    const plugs = generatorPlugs();
    for (const plug of plugs)
      expect(segmentHits(camera, plug.position, BUILDING_SOLID)).toBe(false);
  });
});

describe("withGenerator", () => {
  it("adds the generator after the layout's own parts and keeps the sign plates last", () => {
    const base = withDucts(detailLayout());
    const merged = withGenerator(base);
    expect(merged.boxes.slice(0, base.boxes.length)).toEqual(base.boxes);
    expect(merged.boxes.length).toBe(base.boxes.length + gen.boxes.length);
    expect(merged.faces.slice(0, base.faces.length)).toEqual(base.faces);
    expect(merged.faces.length).toBe(base.faces.length + gen.faces.length);
    expect(merged.beams).toEqual(base.beams);
    const plated = withSignPlates(merged, GEN_BOXES.slice(0, 1));
    expect(plated.boxes.at(-1)?.kind).toBe("signPlate");
  });
});
