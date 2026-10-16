import { describe, expect, it } from "vitest";
import { boxesGeometryData } from "./boxGeometry";
import {
  SIDES,
  WINDOW,
  bandBoxes,
  buildingHeightM,
  floorBoxes,
  pointOnSide,
  roofBoxes,
  sideNormal,
  sideWidthM,
  wallOpenings,
  type Side,
} from "./buildingLayout";
import {
  GRIME_LOOK,
  GRIME_ROUGHNESS,
  GRIME_TEXTURE,
  GRIME_TINTS,
  PLAIN_PATCH,
  PROP_GRIME,
  grimeCell,
  grimeMarks,
  grimeMultiplier,
  grimePixel,
  grimeUv,
  grimeUvs,
  propGrimeMarks,
  roughnessStyle,
  runOffLines,
  rustSources,
  tintStyle,
  type GrimeMark,
  type Tint,
} from "./grimeLayout";

const UP = { x: 0, y: 1, z: 0 };

/** The UV a wall point gets, back in atlas pixels. */
function uvPixel(side: Side, along: number, y: number) {
  const [u, v] = grimeUv(sideNormal(side), pointOnSide(side, along, y, 0));
  return { x: u * GRIME_TEXTURE.widthPx, y: (1 - v) * GRIME_TEXTURE.heightPx };
}

function inCell(side: Side, p: { x: number; y: number }): boolean {
  const c = grimeCell(side);
  return (
    p.x >= c.x && p.x <= c.x + c.width && p.y >= c.y && p.y <= c.y + c.height
  );
}

function plainUv(): [number, number] {
  const p = grimePixel(PLAIN_PATCH.side, PLAIN_PATCH.along, PLAIN_PATCH.y);
  return [p.x / GRIME_TEXTURE.widthPx, 1 - p.y / GRIME_TEXTURE.heightPx];
}

/** Hue in degrees and HSL saturation of a colour given as three channels. */
function hueSat(c: Tint): { hue: number; sat: number } {
  const [r, g, b] = c;
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

describe("the wall grime atlas", () => {
  it("gives each side its own cell, none overlapping, all inside the 2K texture", () => {
    const cells = SIDES.map(grimeCell);
    for (const c of cells) {
      expect(c.x + c.width).toBeLessThanOrEqual(GRIME_TEXTURE.widthPx);
      expect(c.y + c.height).toBeLessThanOrEqual(GRIME_TEXTURE.heightPx);
    }
    for (let i = 0; i < cells.length; i += 1)
      for (let j = i + 1; j < cells.length; j += 1) {
        const a = cells[i];
        const b = cells[j];
        if (a === undefined || b === undefined) continue;
        const apart =
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y;
        expect(apart).toBe(true);
      }
  });

  it("covers every wall's full width and the building's full height", () => {
    for (const side of SIDES) {
      expect(sideWidthM(side) / 2 + 0.15).toBeLessThan(
        GRIME_TEXTURE.extentM / 2,
      );
    }
    expect(buildingHeightM()).toBeLessThan(GRIME_TEXTURE.extentM);
  });

  it("maps a point on a wall to where it is in its side's cell", () => {
    for (const side of SIDES) {
      const low = uvPixel(side, -2, 1);
      const high = uvPixel(side, -2, 10);
      const right = uvPixel(side, 3, 1);
      expect(inCell(side, low)).toBe(true);
      expect(inCell(side, high)).toBe(true);
      // Up the wall is up the canvas; to the right is to the right.
      expect(high.y).toBeLessThan(low.y);
      expect(right.x).toBeGreaterThan(low.x);
      expect(right.x - low.x).toBeCloseTo(5 * (1024 / 14), 6);
    }
  });

  it("maps the floor bands and the parapet's outer face to their side's cell", () => {
    const trim = boxesGeometryData([...bandBoxes(), ...roofBoxes()], 2);
    const uvs = grimeUvs(trim);
    expect(uvs.length).toBe((trim.positions.length / 3) * 2);
    const band = pointOnSide("front", 0, 4.5, 0.15);
    const [u, v] = grimeUv(sideNormal("front"), band);
    expect(
      inCell("front", {
        x: u * GRIME_TEXTURE.widthPx,
        y: (1 - v) * GRIME_TEXTURE.heightPx,
      }),
    ).toBe(true);
  });

  it("sends tops, undersides and faces off the walls to the plain patch", () => {
    const plain = plainUv();
    expect(grimeUv(UP, { x: 0, y: 4.65, z: 0 })).toEqual(plain);
    expect(grimeUv({ x: 0, y: -1, z: 0 }, { x: 0, y: 4.35, z: 0 })).toEqual(
      plain,
    );
    // The front parapet's inner face looks back over the roof, 4.7 m off the back wall.
    expect(grimeUv(sideNormal("back"), { x: 0, y: 13, z: 4.7 })).toEqual(plain);
  });

  it("keeps the plain patch where no wall reaches", () => {
    const walls = boxesGeometryData([...floorBoxes(), ...bandBoxes()], 2);
    const uvs = grimeUvs(walls);
    const plain = plainUv();
    const patchHalfU = 24 / GRIME_TEXTURE.widthPx;
    for (let i = 0; i < uvs.length; i += 2) {
      const u = uvs[i] ?? 0;
      const v = uvs[i + 1] ?? 0;
      if (u === plain[0] && v === plain[1]) continue;
      expect(Math.abs(u - plain[0])).toBeGreaterThan(patchHalfU);
    }
  });
});

describe("the wall marks", () => {
  it("are the same on every load", () => {
    expect(grimeMarks("front")).toEqual(grimeMarks("front"));
    expect(grimeMarks("front")).not.toEqual(grimeMarks("back"));
  });

  const points = (mark: GrimeMark): [number, number][] => {
    switch (mark.kind) {
      case "streak":
        return [[mark.along, mark.topY]];
      case "stain":
        return [[mark.along, mark.y]];
      case "crack":
      case "line":
      case "chip":
        return mark.points.map(([a, y]) => [a, y]);
    }
  };

  it("stay on their side's wall and in its cell", () => {
    for (const side of SIDES)
      for (const mark of grimeMarks(side))
        for (const [along, y] of points(mark)) {
          expect(Math.abs(along)).toBeLessThan(GRIME_TEXTURE.extentM / 2);
          expect(y).toBeGreaterThan(-0.5);
          expect(y).toBeLessThanOrEqual(buildingHeightM() + 0.01);
        }
  });

  it("have every kind on every side: streaks, stains, cracks, chips and tide lines", () => {
    for (const side of SIDES) {
      const kinds = new Set(grimeMarks(side).map((m) => m.kind));
      expect([...kinds].sort()).toEqual([
        "chip",
        "crack",
        "line",
        "stain",
        "streak",
      ]);
    }
  });

  it("add lighter marks on every side: flaked plaster, salt blooms, tide lines and trim scuffs", () => {
    for (const side of SIDES) {
      const marks = grimeMarks(side);
      const count = (kind: GrimeMark["kind"], tint: string): number =>
        marks.filter((m) => m.kind === kind && "tint" in m && m.tint === tint)
          .length;
      expect(count("chip", "plaster")).toBeGreaterThanOrEqual(5);
      expect(count("stain", "salt")).toBeGreaterThanOrEqual(5);
      expect(count("line", "salt")).toBeGreaterThanOrEqual(2);
      expect(count("chip", "scratch")).toBeGreaterThanOrEqual(18);
      // Tide lines stay low on the wall, where rising damp reaches.
      for (const m of marks)
        if (m.kind === "line")
          for (const [, y] of m.points) expect(y).toBeLessThan(1.6);
    }
  });

  it("run water (and some pale lime) off every floor band and the parapet", () => {
    expect(runOffLines()).toHaveLength(3);
    for (const side of SIDES) {
      const streaks = grimeMarks(side).filter(
        (m) => m.kind === "streak" && (m.tint === "water" || m.tint === "salt"),
      );
      for (const lineY of runOffLines()) {
        const off = streaks.filter(
          (m) => m.kind === "streak" && m.topY === lineY,
        );
        expect(off.length).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it("stain under every window's sill (the back's are under the paint)", () => {
    for (const o of wallOpenings()) {
      if (o.kind !== "window") continue;
      const sillY = o.bottomY - WINDOW.sillHeightM;
      const runs = grimeMarks(o.side).filter(
        (m) =>
          m.kind === "streak" &&
          m.topY === sillY &&
          Math.abs(m.along - o.alongM) <= o.widthM / 2,
      );
      expect(runs.length, `${o.side} ${String(o.alongM)}`).toBeGreaterThan(1);
    }
  });

  it("finds the wall props rust runs from, and none from the drain pipes or the roof", () => {
    // Every side has AC units; the left also has a wall vent.
    for (const side of SIDES) {
      const sources = rustSources(side);
      expect(sources.length).toBeGreaterThan(0);
      for (const s of sources) {
        expect(s.bottomY).toBeGreaterThan(0.5);
        expect(s.bottomY).toBeLessThan(12.5);
        expect(Math.abs(s.minAlong)).toBeLessThanOrEqual(
          sideWidthM(side) / 2 + 0.01,
        );
      }
    }
    // The front's two AC units and its vent, and the ARCADE sign.
    expect(rustSources("front").length).toBeGreaterThanOrEqual(3);
  });

  it("run rust down from under each wall prop", () => {
    for (const side of SIDES)
      for (const s of rustSources(side)) {
        const runs = grimeMarks(side).filter(
          (m) =>
            m.kind === "streak" &&
            m.tint === "rust" &&
            m.topY === s.bottomY &&
            m.along >= s.minAlong &&
            m.along <= s.maxAlong,
        );
        expect(runs.length).toBeGreaterThanOrEqual(2);
      }
  });

  it("start cracks at some windows' corners", () => {
    const corners = new Set<string>();
    for (const o of wallOpenings()) {
      if (o.kind !== "window") continue;
      for (const x of [o.alongM - o.widthM / 2, o.alongM + o.widthM / 2])
        for (const y of [o.bottomY + o.heightM, o.bottomY - WINDOW.sillHeightM])
          corners.add(`${o.side} ${x.toFixed(3)} ${y.toFixed(3)}`);
    }
    for (const side of SIDES) {
      const fromCorner = grimeMarks(side).filter((m) => {
        if (m.kind !== "crack") return false;
        const [first] = m.points;
        if (first === undefined) return false;
        return corners.has(
          `${side} ${first[0].toFixed(3)} ${first[1].toFixed(3)}`,
        );
      });
      expect(fromCorner.length).toBeGreaterThan(0);
    }
  });
});

describe("the grime colours", () => {
  it("can be stored at half scale (no multiplier over 2)", () => {
    for (const tint of Object.values(GRIME_TINTS))
      for (const c of tint) {
        expect(c).toBeGreaterThan(0);
        expect(c).toBeLessThanOrEqual(2);
      }
  });

  it("darken for dirt and lighten for chips, bare plaster, salt and scratches", () => {
    const light = ["chip", "plaster", "salt", "scratch"];
    for (const [id, tint] of Object.entries(GRIME_TINTS)) {
      const mean = (tint[0] + tint[1] + tint[2]) / 3;
      if (light.includes(id)) expect(mean, id).toBeGreaterThan(1);
      else if (id === "rust") expect(tint[1]).toBeLessThan(1);
      else expect(mean, id).toBeLessThan(1);
    }
  });

  it("make wet marks glossy and dry ones matte, within what the texture can store", () => {
    for (const r of Object.values(GRIME_ROUGHNESS)) {
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThanOrEqual(2);
    }
    expect(GRIME_ROUGHNESS.water).toBeLessThan(0.5);
    expect(GRIME_ROUGHNESS.damp).toBeLessThan(1);
    expect(GRIME_ROUGHNESS.soot).toBeGreaterThan(1);
    expect(GRIME_ROUGHNESS.salt).toBeGreaterThan(1);
    expect(GRIME_ROUGHNESS.plain).toBe(1);
    expect(roughnessStyle("plain")).toBe("rgba(128, 128, 128, 1)");
  });

  it("have no yellow, amber or orange, even after the contrast curve", () => {
    for (const tint of Object.values(GRIME_TINTS)) {
      for (const c of [tint, grimeMultiplier(tint)]) {
        const { hue, sat } = hueSat(c);
        if (sat > 0.3)
          expect(hue < 15 || hue > 75, `${String(hue)}°`).toBe(true);
      }
    }
  });

  it("encodes 1 as mid-grey, so an untouched texel leaves the surface as it is", () => {
    expect(tintStyle([1, 1, 1])).toBe("rgba(128, 128, 128, 1)");
    expect(tintStyle([0, 0, 0], 0.5)).toBe("rgba(0, 0, 0, 0.5)");
    expect(tintStyle([3, 3, 3], 2)).toBe("rgba(255, 255, 255, 1)");
    expect(grimeMultiplier([1, 1, 1])).toEqual([1, 1, 1]);
    expect(GRIME_LOOK.contrast).toBeGreaterThan(1);
  });
});

describe("the prop grime tile", () => {
  it("keeps its marks inside the tile (they wrap round the edges when drawn)", () => {
    const marks = propGrimeMarks();
    expect(marks.length).toBeGreaterThan(20);
    for (const mark of marks) {
      if (mark.kind === "stain" || mark.kind === "streak") {
        expect(mark.along).toBeGreaterThanOrEqual(0);
        expect(mark.along).toBeLessThan(PROP_GRIME.tileM);
      }
    }
    expect(new Set(marks.map((m) => m.kind))).toEqual(
      new Set(["stain", "streak", "line", "chip"]),
    );
    // Scratches through the paint.
    expect(
      marks.filter((m) => m.kind === "line" && m.tint === "scratch").length,
    ).toBeGreaterThanOrEqual(10);
    expect(propGrimeMarks()).toEqual(propGrimeMarks());
  });

  it("has rust runs down from rust spots", () => {
    const rust = propGrimeMarks().filter(
      (m) => m.kind === "streak" && m.tint === "rust",
    );
    expect(rust.length).toBeGreaterThanOrEqual(10);
  });
});
