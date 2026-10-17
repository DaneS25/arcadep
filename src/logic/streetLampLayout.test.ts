import { describe, expect, it } from "vitest";
import {
  BUILDING,
  SIDES,
  STREET,
  buildingFootprint,
  buildingHeightM,
  floorLevels,
  openingRect,
  pavementY,
  sideNormal,
  sideOffsetM,
  sideTangent,
  sidewalkRect,
  wallOpenings,
  type Box,
  type Vec3,
} from "./buildingLayout";
import { cabinetLayout } from "./cabinetLayout";
import { CAMERA, orbitPosition, posePosition } from "./cameraOrbit";
import { CLOSE_UP_SIDES, stopPose } from "./cameraStops";
import { relativeLuminance } from "./contrast";
import { detailLayout } from "./detailLayout";
import { withDucts } from "./ductLayout";
import { generatorLayout, withGenerator } from "./generatorLayout";
import { MAX_POSTERS, graffitiLayout } from "./graffitiLayout";
import { withLights } from "./lightLayout";
import {
  BLOOM,
  DETAILS_LOOK,
  LAMP_LOOK,
  NEON_LIGHTS,
  STREET_LAMP_LOOK,
} from "./lookConfig";
import { PALETTE } from "./palette";
import { litterKeepOut, rectsOverlap, sidewalkProps } from "./sidewalkLayout";
import { skillSignsLayout } from "./skillSignsLayout";
import {
  STREET_LAMP,
  STREET_LAMPS,
  bulbCentre,
  lampLightPosition,
  streetLampBoxes,
  streetLampFootprints,
  streetLampParts,
  withStreetLamps,
} from "./streetLampLayout";
import { withTaps } from "./tapLayout";
import { terminalLayout } from "./terminalLayout";
import { windowLayout } from "./windowLayout";
import { withWires } from "./wireLayout";

const EPS = 1e-9;

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

function overlaps(a: Box, b: Box): boolean {
  return (["x", "y", "z"] as const).every(
    (axis) =>
      Math.abs(a.centre[axis] - b.centre[axis]) <
      (a.size[axis] + b.size[axis]) / 2 - EPS,
  );
}

/** Hue in degrees (0 to 360) and saturation (0 to 1) of a hex colour. */
function hueSat(hex: string): { hue: number; sat: number } {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return { hue: 0, sat: 0 };
  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  return { hue: (hue * 60 + 360) % 360, sat: d / max };
}

const LAMP_BOXES = streetLampBoxes().map((part) => part.box);

describe("STREET_LAMPS", () => {
  it("are two, each standing on the pavement inside the kerb and off the building", () => {
    expect(STREET_LAMPS).toHaveLength(2);
    const walk = sidewalkRect();
    const k = STREET.kerbWidthM;
    const fp = buildingFootprint();
    for (const [i, rect] of streetLampFootprints().entries()) {
      expect(rect.minX, STREET_LAMPS[i]?.id).toBeGreaterThan(walk.minX + k);
      expect(rect.maxX).toBeLessThan(walk.maxX - k);
      expect(rect.minZ).toBeGreaterThan(walk.minZ + k);
      expect(rect.maxZ).toBeLessThan(walk.maxZ - k);
      expect(rectsOverlap(rect, fp)).toBe(false);
    }
    for (const lamp of STREET_LAMPS) {
      const foot = streetLampParts(lamp).boxes[0];
      expect(foot?.box.centre.y).toBeCloseTo(
        pavementY() + STREET_LAMP.foot.upM / 2,
        9,
      );
    }
  });

  it("hold their heads about level with the first floor, reaching towards the building", () => {
    const first = floorLevels()[1];
    if (first === undefined) throw new Error("no first floor");
    const fp = buildingFootprint();
    const gap = (p: Vec3): number =>
      Math.max(fp.minX - p.x, p.x - fp.maxX, fp.minZ - p.z, p.z - fp.maxZ);
    for (const lamp of STREET_LAMPS) {
      const bulb = bulbCentre(lamp);
      expect(bulb.y).toBeGreaterThan(first.baseY - 0.2);
      expect(bulb.y).toBeLessThan(first.baseY + 1);
      // The arm reaches in: the bulb is nearer the walls than the post, and clear of them
      // and of the trim band's overhang.
      expect(gap(bulb)).toBeLessThan(gap({ x: lamp.x, y: 0, z: lamp.z }));
      expect(gap(bulb)).toBeGreaterThan(BUILDING.bandOverhangM + 0.5);
    }
  });

  it("light the walls: each light is within a third of its reach of a wall", () => {
    for (const lamp of STREET_LAMPS) {
      const p = lampLightPosition(lamp);
      const near = SIDES.filter((side) => {
        const n = sideNormal(side);
        const out = p.x * n.x + p.z * n.z - sideOffsetM(side);
        return out > 0 && out < STREET_LAMP_LOOK.distanceM / 3;
      });
      expect(near.length, lamp.id).toBeGreaterThan(0);
    }
  });

  it("keep clear of every other prop on the pavement and the walls", () => {
    const others = [
      ...[
        ...withTaps(withWires(withLights(withDucts(detailLayout())))).boxes,
        ...generatorLayout().boxes,
        ...sidewalkProps(),
        ...windowLayout().boxes,
      ].map((part) => part.box),
      ...cabinetLayout().parts,
      ...terminalLayout().parts,
    ];
    const hits = LAMP_BOXES.flatMap((box) =>
      others
        .filter((other) => overlaps(box, other))
        .map((other) => JSON.stringify([box.centre, other])),
    );
    expect(hits).toEqual([]);
  });

  it("keep the litter off their feet", () => {
    const keepOut = litterKeepOut();
    for (const foot of streetLampFootprints())
      expect(keepOut.some((r) => rectsOverlap(r, foot))).toBe(true);
  });
});

describe("streetLampParts", () => {
  it("is plain metal with one warm bulb of the light kind, steady (no blink)", () => {
    for (const lamp of STREET_LAMPS) {
      const parts = streetLampParts(lamp);
      for (const part of parts.boxes) expect(part.kind).toBe("metal");
      expect(parts.bulb.kind).toBe("light");
      expect(parts.bulb.glow).toBe("street");
      expect(parts.bulb.blink).toBeUndefined();
    }
  });

  it("hangs the bulb under the head, with the light just below it", () => {
    for (const lamp of STREET_LAMPS) {
      const parts = streetLampParts(lamp);
      const head = parts.boxes.at(-1)?.box;
      if (head === undefined) throw new Error("no head");
      const bulb = parts.bulb.box;
      expect(bulb.centre.y + bulb.size.y / 2).toBeCloseTo(
        head.centre.y - head.size.y / 2,
        9,
      );
      const light = lampLightPosition(lamp);
      expect(light.y).toBeLessThan(bulb.centre.y);
      expect(light.x).toBeCloseTo(bulb.centre.x, 9);
      expect(light.z).toBeCloseTo(bulb.centre.z, 9);
    }
  });
});

describe("withStreetLamps", () => {
  it("adds the lamps after the layout's own parts", () => {
    const base = detailLayout();
    const merged = withStreetLamps(base);
    expect(merged.boxes.slice(0, base.boxes.length)).toEqual(base.boxes);
    expect(merged.boxes.slice(base.boxes.length)).toEqual(streetLampBoxes());
    expect(merged.faces).toEqual(base.faces);
  });
});

describe("STREET_LAMP_LOOK (the warm orange exception, user 2026-10-18)", () => {
  it("is the only warm glow: no other part of the details uses the lamps' patch", () => {
    const all = withStreetLamps(
      withLights(withTaps(withWires(withGenerator(withDucts(detailLayout()))))),
    ).boxes;
    const warm = all.filter((part) => part.glow === "street");
    expect(warm).toEqual(STREET_LAMPS.map((l) => streetLampParts(l).bulb));
  });

  it("is warm orange: not red, not yellow", () => {
    for (const hex of [STREET_LAMP_LOOK.color, STREET_LAMP_LOOK.bulb]) {
      const { hue, sat } = hueSat(hex);
      expect(sat, hex).toBeGreaterThan(0.3);
      expect(hue, hex).toBeGreaterThan(15);
      expect(hue, hex).toBeLessThan(40);
    }
  });

  it("gives the bulb a soft glow, just over the bloom threshold but under the signs' neon", () => {
    const bulb =
      (relativeLuminance(STREET_LAMP_LOOK.bulb) ?? Number.NaN) *
      DETAILS_LOOK.emissiveIntensity;
    expect(bulb).toBeGreaterThan(BLOOM.threshold);
    expect(bulb).toBeLessThan(BLOOM.threshold * 1.25);
  });

  it("leaves the neon leading: each lamp is weaker and shorter-reaching than the neon's lights", () => {
    const weakestNeon = Math.min(...NEON_LIGHTS.map((l) => l.intensity));
    const shortestNeon = Math.min(...NEON_LIGHTS.map((l) => l.distanceM));
    expect(STREET_LAMP_LOOK.intensity).toBeLessThanOrEqual(weakestNeon * 1.5);
    expect(STREET_LAMP_LOOK.distanceM).toBeLessThan(shortestNeon);
    const total = NEON_LIGHTS.reduce((s, l) => s + l.intensity, 0);
    expect(STREET_LAMP_LOOK.intensity * STREET_LAMPS.length).toBeLessThan(
      total,
    );
    // The red neon is still the main accent; the lamps don't change the palette.
    expect(Object.values(PALETTE)).not.toContain(STREET_LAMP_LOOK.color);
    expect(LAMP_LOOK.color).not.toBe(STREET_LAMP_LOOK.color);
  });
});

describe("the street lamps in every camera stop", () => {
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
  /** Clickables, the cabinet screen, the terminal, the sign faces, the posters and the doors. */
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
  /** The building's walls and roof, a hair inside its faces, so props on them aren't hidden. */
  const BUILDING_SOLID: Box = {
    centre: { x: 0, y: buildingHeightM() / 2, z: 0 },
    size: {
      x: BUILDING.widthM - 0.02,
      y: buildingHeightM(),
      z: BUILDING.depthM - 0.02,
    },
  };

  it("hide no clickable, sign face, poster, cabinet screen, terminal or door from any stop", () => {
    let checked = 0;
    const blocked: string[] = [];
    for (const camera of CAMERAS)
      for (const target of TARGETS) {
        if (segmentHits(camera, target, BUILDING_SOLID)) continue;
        checked += 1;
        if (LAMP_BOXES.some((box) => segmentHits(camera, target, box, 0.05)))
          blocked.push(
            `${JSON.stringify(camera)} -> ${JSON.stringify(target)}`,
          );
      }
    expect(checked).toBeGreaterThan(300);
    expect(blocked).toEqual([]);
  });
});
