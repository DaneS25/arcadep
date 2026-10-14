import { describe, expect, it } from "vitest";
import {
  BUILDING,
  SIDES,
  STREET,
  alleyRect,
  kerbBoxes,
  pavementY,
  bandBoxes,
  buildingFootprint,
  floorBoxes,
  roofBoxes,
  sidewalkBox,
  buildingHeightM,
  floorLevels,
  interactionSpots,
  pointOnSide,
  rectContains,
  sideAzimuthRad,
  sideNormal,
  sideTangent,
  sideWidthM,
  sidewalkRect,
  wallHeightM,
  type Box,
  type Side,
} from "./buildingLayout";

describe("floorLevels", () => {
  it("stacks three floors from the ground up with no gaps", () => {
    expect(floorLevels()).toEqual([
      { index: 0, baseY: 0, heightM: 4.5, topY: 4.5 },
      { index: 1, baseY: 4.5, heightM: 4, topY: 8.5 },
      { index: 2, baseY: 8.5, heightM: 4, topY: 12.5 },
    ]);
  });

  it("ends at the wall height", () => {
    expect(floorLevels().at(-1)?.topY).toBe(wallHeightM());
  });
});

describe("buildingHeightM", () => {
  it("adds the roof slab and parapet to the walls", () => {
    expect(buildingHeightM()).toBeCloseTo(
      wallHeightM() + BUILDING.roofThicknessM + BUILDING.parapetHeightM,
    );
  });
});

const top = (box: Box) => box.centre.y + box.size.y / 2;
const bottom = (box: Box) => box.centre.y - box.size.y / 2;

describe("floorBoxes", () => {
  it("fills each floor level across the whole footprint", () => {
    const boxes = floorBoxes();
    expect(boxes).toHaveLength(3);
    floorLevels().forEach((level, i) => {
      const box = boxes[i];
      expect(box && bottom(box)).toBeCloseTo(level.baseY);
      expect(box && top(box)).toBeCloseTo(level.topY);
      expect(box?.size.x).toBe(BUILDING.widthM);
      expect(box?.size.z).toBe(BUILDING.depthM);
    });
  });
});

describe("bandBoxes", () => {
  it("puts one band on each line between floors, wider than the walls", () => {
    const bands = bandBoxes();
    expect(bands.map((b) => b.centre.y)).toEqual([4.5, 8.5]);
    for (const band of bands) {
      expect(band.size.x).toBeGreaterThan(BUILDING.widthM);
      expect(band.size.z).toBeGreaterThan(BUILDING.depthM);
    }
  });
});

describe("roofBoxes", () => {
  const [slab, ...parapets] = roofBoxes();

  it("lays the roof slab on top of the walls", () => {
    expect(slab && bottom(slab)).toBeCloseTo(wallHeightM());
  });

  it("stands four parapets on the slab, reaching the building's full height", () => {
    expect(parapets).toHaveLength(4);
    for (const p of parapets) {
      expect(bottom(p)).toBeCloseTo(slab ? top(slab) : Number.NaN);
      expect(top(p)).toBeCloseTo(buildingHeightM());
    }
  });

  it("keeps the parapets' outer faces flush with the walls", () => {
    const fp = buildingFootprint();
    const minX = Math.min(...parapets.map((p) => p.centre.x - p.size.x / 2));
    const maxX = Math.max(...parapets.map((p) => p.centre.x + p.size.x / 2));
    const minZ = Math.min(...parapets.map((p) => p.centre.z - p.size.z / 2));
    const maxZ = Math.max(...parapets.map((p) => p.centre.z + p.size.z / 2));
    expect([minX, maxX, minZ, maxZ]).toEqual([
      fp.minX,
      fp.maxX,
      fp.minZ,
      fp.maxZ,
    ]);
  });
});

describe("sidewalkBox", () => {
  it("covers the pavement from the ground up to the kerb", () => {
    const box = sidewalkBox();
    const r = sidewalkRect();
    expect(bottom(box)).toBe(0);
    expect(top(box)).toBe(STREET.curbHeightM);
    expect(box.centre.x - box.size.x / 2).toBe(r.minX);
    expect(box.centre.z + box.size.z / 2).toBe(r.maxZ);
  });
});

describe("side frames", () => {
  it("lists each side once, a quarter turn apart in visiting order", () => {
    expect(new Set(SIDES).size).toBe(4);
    SIDES.forEach((side, i) => {
      const next = SIDES[(i + 1) % SIDES.length] ?? side;
      const turn =
        (sideAzimuthRad(next) - sideAzimuthRad(side) + 2 * Math.PI) %
        (2 * Math.PI);
      expect(turn).toBeCloseTo((3 * Math.PI) / 2);
    });
  });

  it.each(SIDES)("gives %s a normal that matches its azimuth", (side) => {
    const n = sideNormal(side);
    expect(n.x).toBeCloseTo(Math.sin(sideAzimuthRad(side)));
    expect(n.z).toBeCloseTo(Math.cos(sideAzimuthRad(side)));
    expect(n.y).toBe(0);
  });

  it.each(SIDES)(
    "gives %s a tangent that points to the right of a visitor facing the wall",
    (side) => {
      const n = sideNormal(side);
      const t = sideTangent(side);
      // Facing the wall means looking along -n; right of that is (-n) x up = (n.z, 0, -n.x).
      expect(t.x).toBeCloseTo(n.z);
      expect(t.y).toBe(0);
      expect(t.z).toBeCloseTo(-n.x);
    },
  );

  it("faces the front towards +z, the right towards +x and the left towards -x", () => {
    expect(sideNormal("front")).toEqual({ x: 0, y: 0, z: 1 });
    expect(sideNormal("right")).toEqual({ x: 1, y: 0, z: 0 });
    expect(sideNormal("back")).toEqual({ x: 0, y: 0, z: -1 });
    expect(sideNormal("left")).toEqual({ x: -1, y: 0, z: 0 });
  });

  it("uses the width for the front and back and the depth for the sides", () => {
    expect(sideWidthM("front")).toBe(BUILDING.widthM);
    expect(sideWidthM("back")).toBe(BUILDING.widthM);
    expect(sideWidthM("left")).toBe(BUILDING.depthM);
    expect(sideWidthM("right")).toBe(BUILDING.depthM);
  });
});

describe("pointOnSide", () => {
  it("puts the wall's centre on the footprint edge", () => {
    expect(pointOnSide("front", 0, 2, 0)).toEqual({
      x: 0,
      y: 2,
      z: BUILDING.depthM / 2,
    });
    expect(pointOnSide("right", 0, 0, 0)).toEqual({
      x: BUILDING.widthM / 2,
      y: 0,
      z: 0,
    });
  });

  it("moves along the wall to the visitor's right and out from it", () => {
    expect(pointOnSide("back", 2, 1, 0.5)).toEqual({
      x: -2,
      y: 1,
      z: -(BUILDING.depthM / 2 + 0.5),
    });
    expect(pointOnSide("left", 3, 1, 1)).toEqual({
      x: -(BUILDING.widthM / 2 + 1),
      y: 1,
      z: 3,
    });
  });
});

describe("street layout", () => {
  it("wraps the pavement all the way round, wider at the back (task 24)", () => {
    const fp = buildingFootprint();
    const walk = sidewalkRect();
    expect(walk.maxZ).toBe(fp.maxZ + STREET.sidewalkWidthM);
    expect(walk.minX).toBe(fp.minX - STREET.sidewalkWidthM);
    expect(walk.maxX).toBe(fp.maxX + STREET.sidewalkWidthM);
    expect(walk.minZ).toBe(fp.minZ - STREET.alleyWidthM);
    expect(pavementY()).toBe(STREET.curbHeightM);
  });

  it("makes the alley the strip of pavement behind the building", () => {
    const fp = buildingFootprint();
    const alley = alleyRect();
    const walk = sidewalkRect();
    expect(alley.maxZ).toBe(fp.minZ);
    expect(alley.maxZ - alley.minZ).toBe(STREET.alleyWidthM);
    expect(alley.minX).toBe(walk.minX);
    expect(alley.maxX).toBe(walk.maxX);
  });

  it("lines the pavement's outer edge with kerb stones, a little proud, all round", () => {
    const walk = sidewalkRect();
    const kerbs = kerbBoxes();
    expect(kerbs).toHaveLength(4);
    for (const k of kerbs) {
      expect(k.centre.y - k.size.y / 2).toBe(0);
      expect(k.centre.y + k.size.y / 2).toBeCloseTo(
        STREET.curbHeightM + STREET.kerbRiseM,
      );
      expect(Math.min(k.size.x, k.size.z)).toBeCloseTo(STREET.kerbWidthM);
      expect(k.centre.x - k.size.x / 2).toBeGreaterThanOrEqual(
        walk.minX - 1e-9,
      );
      expect(k.centre.x + k.size.x / 2).toBeLessThanOrEqual(walk.maxX + 1e-9);
      expect(k.centre.z - k.size.z / 2).toBeGreaterThanOrEqual(
        walk.minZ - 1e-9,
      );
      expect(k.centre.z + k.size.z / 2).toBeLessThanOrEqual(walk.maxZ + 1e-9);
    }
    // Each edge of the pavement is touched by one kerb.
    const touches = (pick: (k: (typeof kerbs)[number]) => boolean): number =>
      kerbs.filter(pick).length;
    expect(
      touches((k) => k.centre.z + k.size.z / 2 === walk.maxZ),
    ).toBeGreaterThan(0);
    expect(
      touches((k) => k.centre.z - k.size.z / 2 === walk.minZ),
    ).toBeGreaterThan(0);
    expect(
      touches((k) => k.centre.x - k.size.x / 2 === walk.minX),
    ).toBeGreaterThan(0);
    expect(
      touches((k) => k.centre.x + k.size.x / 2 === walk.maxX),
    ).toBeGreaterThan(0);
  });
});

describe("rectContains", () => {
  it("counts edges as inside and anything past them as outside", () => {
    const rect = { minX: -1, maxX: 1, minZ: -2, maxZ: 2 };
    expect(rectContains(rect, 1, 2)).toBe(true);
    expect(rectContains(rect, 0, 0)).toBe(true);
    expect(rectContains(rect, 1.01, 0)).toBe(false);
    expect(rectContains(rect, 0, -2.01)).toBe(false);
  });
});

describe("interactionSpots", () => {
  const spots = interactionSpots();
  const bySide = (side: Side) => {
    const spot = spots.find((s) => s.side === side);
    if (spot === undefined) throw new Error(`no spot for ${side}`);
    return spot;
  };

  it("gives every side one spot with a unique id, in visiting order", () => {
    expect(spots.map((s) => s.side)).toEqual([...SIDES]);
    expect(spots.map((s) => s.id)).toEqual([
      "spot-front",
      "spot-left",
      "spot-back",
      "spot-right",
    ]);
  });

  it.each(SIDES)(
    "keeps the %s marker outside the walls, on its own side",
    (side) => {
      const { position, size } = bySide(side);
      const n = sideNormal(side);
      const wall = pointOnSide(side, 0, 0, 0);
      const distOut = (position.x - wall.x) * n.x + (position.z - wall.z) * n.z;
      expect(distOut - size.z / 2).toBeGreaterThan(0);
    },
  );

  it.each(SIDES)(
    "fits the %s marker within its wall's width and height",
    (side) => {
      const { position, size } = bySide(side);
      const t = sideTangent(side);
      const along = position.x * t.x + position.z * t.z;
      expect(Math.abs(along) + size.x / 2).toBeLessThanOrEqual(
        sideWidthM(side) / 2,
      );
      expect(position.y - size.y / 2).toBeGreaterThanOrEqual(0);
      expect(position.y + size.y / 2).toBeLessThanOrEqual(wallHeightM());
    },
  );

  it("stands the arcade cabinet on the front pavement", () => {
    const { position, size } = bySide("front");
    expect(position.y - size.y / 2).toBeCloseTo(STREET.curbHeightM);
    expect(rectContains(sidewalkRect(), position.x, position.z)).toBe(true);
  });

  it("puts the neon signs on the first floor", () => {
    const { position, size } = bySide("left");
    const first = floorLevels()[1];
    expect(first).toBeDefined();
    expect(position.y - size.y / 2).toBeGreaterThanOrEqual(first?.baseY ?? 0);
    expect(position.y + size.y / 2).toBeLessThanOrEqual(first?.topY ?? 0);
  });

  it("puts the graffiti wall's marker inside the alley", () => {
    const { position } = bySide("back");
    expect(rectContains(alleyRect(), position.x, position.z)).toBe(true);
  });

  it("puts the door terminal on the ground floor at hand height", () => {
    const { position } = bySide("right");
    expect(position.y).toBeGreaterThan(1);
    expect(position.y).toBeLessThan(2);
  });
});
