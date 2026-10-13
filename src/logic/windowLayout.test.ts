import { describe, expect, it } from "vitest";
import {
  BUILDING,
  SIDES,
  floorLevels,
  glassRects,
  interactionSpots,
  openingRect,
  sideNormal,
  sideOffsetM,
  sideTangent,
  sideWidthM,
  wallOpenings,
  type Box,
  type Side,
  type WallRect,
} from "./buildingLayout";
import {
  VERTICES_PER_BOX,
  detailGeometryData,
  detailLayout,
  glassVertexStarts,
  withSignPlates,
  signPlateVertices,
  type DetailShades,
} from "./detailLayout";
import { graffitiLayout } from "./graffitiLayout";
import { maxFlashesPerSecond } from "./neonFlicker";
import { neonStrips } from "./neonLayout";
import { skillSignsLayout } from "./skillSignsLayout";
import { SIDE_DOOR } from "./terminalLayout";
import {
  BACK_PAINT_OUT_M,
  FIRE_ESCAPE,
  dimmedWindow,
  flickeringPanes,
  windowCell,
  windowLayout,
  withWindows,
} from "./windowLayout";

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
};

const dot = (
  a: { x: number; y?: number; z: number },
  b: { x: number; z: number },
): number => a.x * b.x + a.z * b.z;

/**
 * Where a box sits against a side's wall: its along and up extents, and how far its near
 * and far faces stand out from the wall.
 */
function onWall(
  box: Box,
  side: Side,
): WallRect & { nearOut: number; farOut: number } {
  const t = sideTangent(side);
  const n = sideNormal(side);
  const along = dot(box.centre, t);
  const halfAlong = Math.abs(dot(box.size, t)) / 2;
  const out = dot(box.centre, n) - sideOffsetM(side);
  const halfOut = Math.abs(dot(box.size, n)) / 2;
  return {
    side,
    minAlong: along - halfAlong,
    maxAlong: along + halfAlong,
    minY: box.centre.y - box.size.y / 2,
    maxY: box.centre.y + box.size.y / 2,
    nearOut: out - halfOut,
    farOut: out + halfOut,
  };
}

const overlaps = (a: WallRect, b: WallRect): boolean =>
  a.minAlong < b.maxAlong - EPS &&
  b.minAlong < a.maxAlong - EPS &&
  a.minY < b.maxY - EPS &&
  b.minY < a.maxY - EPS;

/** Everything already mounted on a side's wall that a window or door must keep clear of. */
function wallProps(side: Side): WallRect[] {
  const boxes: Box[] = [
    ...detailLayout()
      .boxes.filter((part) => part.kind !== "puddle")
      .map((part) => part.box),
    ...neonStrips().map((strip) => strip.box),
    ...skillSignsLayout(12).signs.map((sign) => sign.plate),
    ...interactionSpots()
      .filter((spot) => spot.side === side)
      .map((spot): Box => {
        const t = sideTangent(side);
        const n = sideNormal(side);
        return {
          centre: spot.position,
          size: {
            x: Math.abs(t.x) * spot.size.x + Math.abs(n.x) * spot.size.z,
            y: spot.size.y,
            z: Math.abs(t.z) * spot.size.x + Math.abs(n.z) * spot.size.z,
          },
        };
      }),
  ];
  const rects: WallRect[] = boxes
    .map((box) => onWall(box, side))
    // Against this wall: in front of it, and not out across the street or the alley.
    .filter((r) => r.farOut > EPS && r.nearOut < 0.6);
  if (side === "right")
    rects.push({
      side,
      minAlong: SIDE_DOOR.alongM - SIDE_DOOR.widthM / 2,
      maxAlong: SIDE_DOOR.alongM + SIDE_DOOR.widthM / 2,
      minY: 0,
      maxY: SIDE_DOOR.heightM + 0.2,
    });
  return rects;
}

describe("wallOpenings", () => {
  const openings = wallOpenings();
  const floors = floorLevels();

  it("puts windows on every floor of every side (the back's ground floor is the poster row and its doors)", () => {
    for (const side of SIDES)
      floors.forEach((floor) => {
        const windows = openings.filter(
          (o) =>
            o.side === side && o.floor === floor.index && o.kind === "window",
        );
        if (side === "back" && floor.index === 0) return;
        expect(
          windows.length,
          `${side} floor ${String(floor.index)}`,
        ).toBeGreaterThan(0);
      });
  });

  it("has the shop door, two back doors and a fire-escape door", () => {
    const doors = openings.filter((o) => o.kind === "door");
    expect(doors.filter((d) => d.door === "shop").map((d) => d.side)).toEqual([
      "front",
    ]);
    expect(doors.filter((d) => d.door === "back")).toHaveLength(2);
    const fire = doors.filter((d) => d.door === "fireEscape");
    expect(fire).toHaveLength(1);
    expect(fire[0]?.floor).toBeGreaterThan(0);
  });

  it("mixes lit, shaded, dark, broken and boarded windows in every light", () => {
    const windows = openings.filter((o) => o.kind === "window");
    for (const look of [
      "lit",
      "blinds",
      "silhouette",
      "dark",
      "broken",
      "boarded",
    ])
      expect(windows.some((w) => w.look === look)).toBe(true);
    const lit = windows.filter((w) =>
      ["lit", "blinds", "silhouette"].includes(w.look),
    );
    for (const light of ["purple", "red", "cold"])
      expect(lit.some((w) => w.light === light)).toBe(true);
    // Some stay dark: about a third aren't lit at all.
    expect(windows.length - lit.length).toBeGreaterThanOrEqual(
      windows.length / 4,
    );
  });

  it("keeps every opening on its wall and inside its floor, under the floor band", () => {
    for (const o of openings) {
      const r = openingRect(o);
      const half = sideWidthM(o.side) / 2;
      expect(r.minAlong).toBeGreaterThan(-half);
      expect(r.maxAlong).toBeLessThan(half);
      const floor = floors[o.floor];
      if (floor === undefined) throw new Error(`no floor ${String(o.floor)}`);
      expect(r.minY).toBeGreaterThanOrEqual(floor.baseY);
      expect(r.maxY).toBeLessThan(floor.topY - BUILDING.bandHeightM / 2);
    }
  });

  it("never overlaps another opening", () => {
    openings.forEach((a, i) => {
      openings.slice(i + 1).forEach((b) => {
        if (a.side !== b.side) return;
        expect(overlaps(openingRect(a), openingRect(b))).toBe(false);
      });
    });
  });

  it("keeps clear of every prop, sign, neon tube and interaction spot on its wall", () => {
    for (const side of SIDES) {
      const props = wallProps(side);
      // AC units, vents, pipes, neon, signs and the spot are all found.
      expect(props.length, side).toBeGreaterThan(5);
      for (const o of openings.filter((x) => x.side === side)) {
        const r = openingRect(o);
        // The sill hangs under the frame and sticks out past it.
        const withSill = { ...r, minY: r.minY - 0.08 };
        for (const prop of props)
          expect(
            overlaps(withSill, prop),
            `${side} ${o.kind} at ${String(o.alongM)} vs ${JSON.stringify(prop)}`,
          ).toBe(false);
      }
    }
  });

  it("lists the glass to keep clean: windows only, and never the boarded ones", () => {
    for (const side of SIDES) {
      const glass = glassRects(side);
      const expected = openings.filter(
        (o) => o.side === side && o.kind === "window" && o.look !== "boarded",
      );
      expect(glass).toEqual(expected.map(openingRect));
    }
  });
});

describe("windowLayout", () => {
  const parts = windowLayout();

  it("gives every window a pane, and the shop door one too", () => {
    const openings = wallOpenings();
    const panes =
      openings.filter((o) => o.kind === "window").length +
      openings.filter((o) => o.door === "shop").length;
    expect(parts.glass).toHaveLength(panes);
  });

  it("maps boarded windows to dark glass and lit ones to their light", () => {
    const base = wallOpenings()[0];
    if (base === undefined) throw new Error("no openings");
    expect(windowCell({ ...base, look: "boarded" })).toBe("dark");
    expect(windowCell({ ...base, look: "broken" })).toBe("broken");
    expect(windowCell({ ...base, look: "blinds", light: "red" })).toBe(
      "blinds-red",
    );
  });

  it("keeps the back doors and boarded windows behind the paint, so the graffiti covers them", () => {
    // The paint layer's distance from the back wall.
    const wall = graffitiLayout(3, 1).wall;
    const n = sideNormal("back");
    const paintOut = dot(wall.corners[0], n) - sideOffsetM("back");
    expect(paintOut).toBeCloseTo(BACK_PAINT_OUT_M);
    const painted = wallOpenings().filter(
      (o) => o.side === "back" && (o.kind === "door" || o.look === "boarded"),
    );
    expect(painted.length).toBeGreaterThan(0);
    for (const o of painted) {
      const opening = openingRect(o);
      // Frames, leaves and planks over this opening (planks run a little past the frame).
      const over = parts.boxes
        .filter((part) => ["frame", "door", "board"].includes(part.kind))
        .map((part) => onWall(part.box, "back"))
        .filter(
          (r) =>
            r.nearOut > -EPS &&
            r.nearOut < 0.1 &&
            r.minAlong >= opening.minAlong - 0.1 &&
            r.maxAlong <= opening.maxAlong + 0.1 &&
            r.minY >= opening.minY - EPS &&
            r.maxY <= opening.maxY + EPS,
        );
      expect(over.length).toBeGreaterThan(0);
      for (const r of over) expect(r.farOut).toBeLessThan(BACK_PAINT_OUT_M);
    }
  });

  it("hangs the fire escape's landing under its door and the ladder clear of the alley floor", () => {
    const door = wallOpenings().find((o) => o.door === "fireEscape");
    if (door === undefined) throw new Error("no fire-escape door");
    const near = parts.boxes
      .map((p) => onWall(p.box, door.side))
      .filter(
        (r) =>
          r.minAlong >= door.alongM - FIRE_ESCAPE.landing.across / 2 - EPS &&
          r.maxAlong <= door.alongM + FIRE_ESCAPE.landing.across / 2 + EPS &&
          r.nearOut >= FIRE_ESCAPE.gapM - EPS,
      );
    const landing = near.find(
      (r) => Math.abs(r.maxY - door.bottomY) < EPS && r.farOut > 1,
    );
    expect(landing).toBeDefined();
    const lowest = Math.min(...near.map((r) => r.minY));
    expect(lowest).toBeCloseTo(FIRE_ESCAPE.ladderBottomY);
    // Clear of the back door below it.
    expect(lowest).toBeGreaterThan(2.3);
  });
});

describe("withWindows", () => {
  const plates = skillSignsLayout(7).signs.map((sign) => sign.plate);
  const base = detailLayout();
  const layout = withSignPlates(withWindows(base), plates);

  it("adds the windows after the layout's own parts and keeps the sign plates last", () => {
    expect(layout.boxes.slice(0, base.boxes.length)).toEqual(base.boxes);
    expect(layout.faces).toEqual(base.faces);
    const range = signPlateVertices(layout);
    expect(range.count).toBe(plates.length * VERTICES_PER_BOX);
    expect(range.start + range.count).toBe(
      layout.boxes.length * VERTICES_PER_BOX,
    );
  });

  it("finds each pane's vertices in the merged geometry", () => {
    const data = detailGeometryData(layout, 1, SHADES);
    const starts = glassVertexStarts(layout);
    expect(starts).toHaveLength(layout.glass.length);
    layout.glass.forEach((pane, i) => {
      const start = starts[i] ?? -1;
      pane.quad.corners.forEach((corner, k) => {
        const v = start + k;
        expect(data.positions[v * 3]).toBeCloseTo(corner.x);
        expect(data.positions[v * 3 + 1]).toBeCloseTo(corner.y);
        expect(data.positions[v * 3 + 2]).toBeCloseTo(corner.z);
        expect(data.colors[v * 3]).toBe(SHADES.face);
      });
    });
    expect(Math.max(...data.indices)).toBe(data.positions.length / 3 - 1);
  });

  it("stays a light mesh with the windows in", () => {
    const data = detailGeometryData(layout, 1, SHADES);
    expect(data.indices.length / 3).toBeLessThan(5000);
  });
});

describe("window flicker", () => {
  const glass = withWindows(detailLayout()).glass;
  const flicker = flickeringPanes(glass);

  it("flickers a few windows, all on the right side, away from the skill signs", () => {
    expect(flicker.length).toBeGreaterThanOrEqual(2);
    const right = sideNormal("right");
    for (const i of flicker) {
      const pane = glass[i];
      expect(pane?.quad.normal).toEqual(right);
    }
  });

  it("never cuts out more than 3 times in any one-second window", () => {
    const stepMs = 10;
    const starts: number[] = [];
    let previous: number | undefined;
    for (let t = 0; t < 60_000; t += stepMs) {
      const now = dimmedWindow(t, flicker.length, false);
      if (now !== undefined && now !== previous) starts.push(t);
      previous = now;
    }
    expect(starts.length).toBeGreaterThan(0);
    for (const start of starts) {
      const inWindow = starts.filter((s) => s >= start && s < start + 1000);
      expect(inWindow.length).toBeLessThanOrEqual(maxFlashesPerSecond());
    }
    expect(maxFlashesPerSecond()).toBeLessThanOrEqual(3);
  });

  it("stays steady under reduced motion", () => {
    for (let t = 0; t < 20_000; t += 7)
      expect(dimmedWindow(t, flicker.length, true)).toBeUndefined();
  });
});
