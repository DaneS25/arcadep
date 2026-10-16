import { describe, expect, it } from "vitest";
import { paintClearRects } from "./lightLayout";
import {
  BUILDING,
  bandBoxes,
  floorLevels,
  glassRects,
  interactionSpots,
  openingRect,
  wallOpenings,
  sideNormal,
  sideWidthM,
  type Vec3,
} from "./buildingLayout";
import {
  GRAFFITI_TEXTURE,
  LAYER_OUT_M,
  MAX_POSTERS,
  POSTER_SIZES,
  POSTER_SLOTS,
  POSTERS_VIEW,
  TAG_AREA,
  atlasQuadGeometryData,
  graffitiLayout,
  posterAt,
  posterCell,
  posterGlowScale,
  posterKeepOut,
  posterSlotRect,
  posterSpreadCentre,
  postersViewPose,
  posterVertexFlags,
  SILL_DRIP_COLORS,
  SILL_DRIP_WINDOWS,
  WEATHER_COLORS,
  rectUv,
  sillDrips,
  tiltedHalfExtents,
  wallPixelRect,
  weatherStreaks,
} from "./graffitiLayout";
import { WINDOW, type Box, type WallRect } from "./buildingLayout";
import { detailLayout } from "./detailLayout";
import { backLampPosition, withDucts } from "./ductLayout";
import { neonStrips } from "./neonLayout";
import { PALETTE } from "./palette";
import { fireEscapeParts } from "./windowLayout";

const EPS = 1e-9;

function backSpot() {
  const spot = interactionSpots().find((s) => s.side === "back");
  if (spot === undefined) throw new Error("no back spot");
  return spot;
}

/** A world point in the back spot's local frame (the back wall faces -z; across runs -x). */
function local(p: Vec3): { across: number; up: number; out: number } {
  const spot = backSpot();
  return {
    across: -(p.x - spot.position.x),
    up: p.y - (spot.position.y - spot.size.y / 2),
    out: -(p.z - spot.position.z) + spot.size.z / 2,
  };
}

/** A world point on the back wall: along it to a visitor's right (-x) and up. */
function onWall(p: Vec3): { along: number; y: number } {
  return { along: -p.x, y: p.y };
}

const BACK_Z = -BUILDING.depthM / 2;

/** Whether a box sits on or just off the back wall (within 2 m of it). */
function onBackWall(box: Box): boolean {
  const near = box.centre.z + box.size.z / 2;
  const far = box.centre.z - box.size.z / 2;
  return far < BACK_Z + 0.01 && near > BACK_Z - 2;
}

/** A box seen flat on the back wall. */
function boxRect(box: Box): WallRect {
  return {
    side: "back",
    minAlong: -(box.centre.x + box.size.x / 2),
    maxAlong: -(box.centre.x - box.size.x / 2),
    minY: box.centre.y - box.size.y / 2,
    maxY: box.centre.y + box.size.y / 2,
  };
}

function rectsMeet(a: WallRect, b: WallRect, margin: number): boolean {
  return (
    a.minAlong < b.maxAlong + margin &&
    b.minAlong < a.maxAlong + margin &&
    a.minY < b.maxY + margin &&
    b.minY < a.maxY + margin
  );
}

function rectHas(
  r: WallRect,
  along: number,
  y: number,
  margin: number,
): boolean {
  return (
    along > r.minAlong - margin &&
    along < r.maxAlong + margin &&
    y > r.minY - margin &&
    y < r.maxY + margin
  );
}

describe("POSTER_SLOTS (task 27)", () => {
  const slots = posterKeepOut();
  const MARGIN = 0.05;

  it("spreads the first three posters over all three floors", () => {
    const floors = floorLevels();
    const floorOf = (y: number) =>
      floors.findIndex((f) => y >= f.baseY && y < f.topY);
    expect(POSTER_SLOTS.slice(0, 3).map((s) => floorOf(s.centreY))).toEqual([
      0, 1, 2,
    ]);
    for (const rect of slots) {
      const floor = floors[floorOf((rect.minY + rect.maxY) / 2)];
      if (floor === undefined) throw new Error("no floor");
      // Each poster stays on its own floor, off the pavement and clear of the floor bands.
      expect(rect.minY).toBeGreaterThan(
        floor.baseY + (floor.index > 0 ? BUILDING.bandHeightM / 2 : 0.5),
      );
      expect(rect.maxY).toBeLessThan(floor.topY - BUILDING.bandHeightM / 2);
      expect(rect.minAlong).toBeGreaterThan(-TAG_AREA.widthM / 2);
      expect(rect.maxAlong).toBeLessThan(TAG_AREA.widthM / 2);
    }
  });

  it("keeps the slots apart", () => {
    for (let a = 0; a < slots.length; a += 1)
      for (let b = a + 1; b < slots.length; b += 1) {
        const p = slots[a];
        const q = slots[b];
        if (p === undefined || q === undefined) throw new Error("no slot");
        expect(rectsMeet(p, q, 0.2)).toBe(false);
      }
  });

  it("keeps every slot clear of the back doors, windows and their sills", () => {
    for (const o of wallOpenings().filter((o) => o.side === "back")) {
      const frame = openingRect(o);
      const withSill = {
        ...frame,
        minAlong: frame.minAlong - WINDOW.sillOverhangM,
        maxAlong: frame.maxAlong + WINDOW.sillOverhangM,
        minY: frame.minY - WINDOW.sillHeightM,
      };
      for (const rect of slots)
        expect(rectsMeet(rect, withSill, MARGIN)).toBe(false);
    }
  });

  it("keeps every slot clear of the fire escape, the lamp, the props, the bands and the neon", () => {
    const fireDoor = wallOpenings().find((o) => o.door === "fireEscape");
    if (fireDoor === undefined) throw new Error("no fire escape");
    const details = withDucts(detailLayout());
    const fireEscape = fireEscapeParts(fireDoor);
    const boxes: Box[] = [
      ...details.boxes.map(({ box }) => box),
      ...fireEscape.boxes.map(({ box }) => box),
      ...neonStrips().map(({ box }) => box),
      ...bandBoxes(),
    ].filter(onBackWall);
    expect(boxes.length).toBeGreaterThan(20);
    for (const box of boxes)
      for (const rect of slots)
        expect(rectsMeet(rect, boxRect(box), MARGIN)).toBe(false);
    // The landing reaches 1.25 m out: a wider berth, so it never hides a poster's edge.
    const landing = fireEscape.boxes[0];
    if (landing === undefined) throw new Error("no landing");
    for (const rect of slots)
      expect(rectsMeet(rect, boxRect(landing.box), 0.1)).toBe(false);
    const lamp = backLampPosition();
    for (const rect of slots)
      expect(rectHas(rect, onWall(lamp).along, lamp.y, 0.5)).toBe(false);
    // The cables and the drop ladder: samples all along each beam.
    const beams = [...details.beams, ...fireEscape.beams].filter(
      (b) => b.from.z < BACK_Z + 0.01 && b.to.z < BACK_Z + 0.01,
    );
    expect(beams.length).toBeGreaterThan(0);
    for (const beam of beams)
      for (let t = 0; t <= 1; t += 0.05) {
        const along = -(beam.from.x + (beam.to.x - beam.from.x) * t);
        const y = beam.from.y + (beam.to.y - beam.from.y) * t;
        for (const rect of slots)
          expect(rectHas(rect, along, y, MARGIN)).toBe(false);
      }
  });

  it("has no slot past the last one", () => {
    expect(posterSlotRect(MAX_POSTERS)).toBeUndefined();
    expect(slots).toHaveLength(MAX_POSTERS);
  });
});

describe("postersViewPose", () => {
  it("aims at the middle of the posters' spread, straight on to the back wall", () => {
    const pose = postersViewPose();
    const centre = posterSpreadCentre();
    expect(onWall(pose.target).along).toBeCloseTo(centre.alongM);
    expect(pose.target.y).toBeCloseTo(centre.y);
    expect(pose.orbit.distanceM).toBe(POSTERS_VIEW.distanceM);
    // The spread's middle is on the first floor.
    expect(centre.y).toBeGreaterThan(4.5);
    expect(centre.y).toBeLessThan(8.5);
  });
});

describe("posterCell and rectUv", () => {
  it("lays the cells out below the tag band without overlapping", () => {
    const cells = Array.from({ length: MAX_POSTERS }, (_, i) => posterCell(i));
    for (const cell of cells) {
      expect(cell.y).toBeGreaterThanOrEqual(GRAFFITI_TEXTURE.wallHeightPx);
      expect(cell.x + cell.width).toBeLessThanOrEqual(GRAFFITI_TEXTURE.widthPx);
      expect(cell.y + cell.height).toBeLessThanOrEqual(
        GRAFFITI_TEXTURE.heightPx,
      );
    }
    for (let a = 0; a < cells.length; a += 1)
      for (let b = a + 1; b < cells.length; b += 1) {
        const p = cells[a];
        const q = cells[b];
        if (p === undefined || q === undefined) throw new Error("no cell");
        const apart =
          p.x + p.width <= q.x ||
          q.x + q.width <= p.x ||
          p.y + p.height <= q.y ||
          q.y + q.height <= p.y;
        expect(apart).toBe(true);
      }
  });

  it("maps a rectangle to texture coordinates with v up", () => {
    expect(rectUv({ x: 0, y: 0, width: 2048, height: 512 })).toEqual({
      uMin: 0,
      uMax: 1,
      vMin: 0.75,
      vMax: 1,
    });
    expect(rectUv(posterCell(1))).toEqual({
      uMin: 0.125,
      uMax: 0.25,
      vMin: 1 - 2047 / 2048,
      vMax: 1 - 1727 / 2048,
    });
  });
});

describe("tiltedHalfExtents", () => {
  it("is half the size when straight and grows when turned", () => {
    expect(tiltedHalfExtents(2, 1, 0)).toEqual({ x: 1, y: 0.5 });
    const turned = tiltedHalfExtents(2, 1, 0.1);
    expect(turned.x).toBeGreaterThan(0.99);
    expect(turned.y).toBeGreaterThan(0.5);
  });
});

describe("graffitiLayout", () => {
  it("covers the whole back wall with the tag layer, from the ground into the second storey", () => {
    const layout = graffitiLayout(3, 1);
    expect(layout.id).toBe("spot-back");
    const xs = layout.wall.corners.map((c) => c.x);
    const ys = layout.wall.corners.map((c) => c.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(TAG_AREA.widthM);
    expect(TAG_AREA.widthM).toBeGreaterThan(sideWidthM("back") - 0.5);
    expect(TAG_AREA.widthM).toBeLessThan(sideWidthM("back"));
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0);
    expect(Math.min(...ys)).toBeCloseTo(TAG_AREA.bottomY);
    expect(Math.min(...ys)).toBeLessThan(0.2);
    expect(Math.max(...ys)).toBeCloseTo(TAG_AREA.topY);
    expect(Math.max(...ys)).toBeGreaterThan(
      (floorLevels()[2]?.baseY ?? 0) + 0.5,
    );
    for (const c of layout.wall.corners.map(local))
      expect(c.out).toBeCloseTo(LAYER_OUT_M.tags);
    expect(layout.wall.normal).toEqual(sideNormal("back"));
  });

  it("gives the tag layer's atlas band the same shape as the wall it covers", () => {
    const band = GRAFFITI_TEXTURE.widthPx / GRAFFITI_TEXTURE.wallHeightPx;
    const wall = TAG_AREA.widthM / (TAG_AREA.topY - TAG_AREA.bottomY);
    expect(Math.abs(band / wall - 1)).toBeLessThan(0.01);
  });

  it("picks only the posters: one quad over each, just in front of it", () => {
    const layout = graffitiLayout(MAX_POSTERS, 1);
    expect(layout.pickAreas).toHaveLength(layout.posters.length);
    layout.pickAreas.forEach((area, i) => {
      const poster = layout.posters[i];
      if (poster === undefined) throw new Error("no poster");
      area.corners.map(local).forEach((c, k) => {
        const p = local(poster.quad.corners[k] ?? poster.centre);
        expect(c.across).toBeCloseTo(p.across);
        expect(c.up).toBeCloseTo(p.up);
        expect(c.out).toBeCloseTo(LAYER_OUT_M.pick);
        expect(c.out).toBeGreaterThan(LAYER_OUT_M.posters);
      });
    });
  });

  it("is the same for the same seed", () => {
    expect(graffitiLayout(5, 42)).toEqual(graffitiLayout(5, 42));
  });

  it("pastes one poster per project, capped at the maximum", () => {
    expect(graffitiLayout(0, 1).posters).toHaveLength(0);
    expect(graffitiLayout(3, 1).posters).toHaveLength(3);
    expect(graffitiLayout(MAX_POSTERS + 4, 1).posters).toHaveLength(
      MAX_POSTERS,
    );
  });

  for (const count of [1, 3, MAX_POSTERS]) {
    for (const seed of [1, 7, 123]) {
      it(`keeps ${String(count)} posters (seed ${String(seed)}) inside their slots, over the tags`, () => {
        const { posters } = graffitiLayout(count, seed);
        posters.forEach((poster, i) => {
          const rect = posterSlotRect(i);
          if (rect === undefined) throw new Error("no slot");
          for (const c of poster.quad.corners) {
            const w = onWall(c);
            expect(w.along).toBeGreaterThanOrEqual(rect.minAlong - EPS);
            expect(w.along).toBeLessThanOrEqual(rect.maxAlong + EPS);
            expect(w.y).toBeGreaterThanOrEqual(rect.minY - EPS);
            expect(w.y).toBeLessThanOrEqual(rect.maxY + EPS);
            expect(local(c).out).toBeCloseTo(LAYER_OUT_M.posters);
            expect(local(c).out).toBeGreaterThan(LAYER_OUT_M.tags);
          }
          expect(Math.abs(poster.tiltRad)).toBeLessThanOrEqual(
            POSTER_SIZES.maxTiltRad,
          );
          expect(poster.widthM).toBe(POSTER_SLOTS[i]?.widthM);
          expect(poster.heightM / poster.widthM).toBeCloseTo(
            POSTER_SIZES.aspect,
          );
        });
      });
    }
  }

  it("makes the posters much bigger than the old row's 1.1 m at most (task 27)", () => {
    const widths = POSTER_SLOTS.map((slot) => slot.widthM);
    for (const w of widths) expect(w).toBeGreaterThan(1.1);
    const mean = widths.reduce((sum, w) => sum + w, 0) / widths.length;
    expect(mean).toBeGreaterThan(1.5);
  });

  it("maps each poster to its own atlas cell", () => {
    const { posters } = graffitiLayout(3, 1);
    posters.forEach((poster, i) => {
      expect(poster.cell).toEqual(posterCell(i));
      expect(poster.quad.uMin).toBe(rectUv(posterCell(i)).uMin);
    });
  });
});

describe("atlasQuadGeometryData", () => {
  it("builds four vertices and two triangles per quad with the quad's uvs", () => {
    const layout = graffitiLayout(2, 1);
    const quads = [layout.wall, ...layout.posters.map((p) => p.quad)];
    const data = atlasQuadGeometryData(quads);
    expect(data.positions).toHaveLength(quads.length * 4 * 3);
    expect(data.normals).toHaveLength(quads.length * 4 * 3);
    expect(data.uvs).toHaveLength(quads.length * 4 * 2);
    expect(data.indices).toHaveLength(quads.length * 6);
    const poster = layout.posters[0]?.quad;
    if (poster === undefined) throw new Error("no poster");
    // The first poster's bottom-left and top-right uvs.
    expect(data.uvs.slice(8, 10)).toEqual([poster.uMin, poster.vMin]);
    expect(data.uvs.slice(12, 14)).toEqual([poster.uMax, poster.vMax]);
  });
});

describe("posterAt", () => {
  const layout = graffitiLayout(5, 42);

  it("finds each poster from a hit at its centre and near its corners", () => {
    layout.posters.forEach((poster, i) => {
      expect(posterAt(layout, poster.centre)).toBe(i);
      for (const corner of poster.quad.corners) {
        // A little in from the corner, towards the centre.
        const p = {
          x: corner.x + (poster.centre.x - corner.x) * 0.05,
          y: corner.y + (poster.centre.y - corner.y) * 0.05,
          z: corner.z,
        };
        expect(posterAt(layout, p)).toBe(i);
      }
    });
  });

  it("finds nothing on the bare wall between and above the posters", () => {
    const [first, , , fourth] = layout.posters;
    if (first === undefined || fourth === undefined) throw new Error("posters");
    const between = {
      x: (first.centre.x + fourth.centre.x) / 2,
      y: first.centre.y,
      z: first.centre.z,
    };
    expect(posterAt(layout, between)).toBeUndefined();
    expect(posterAt(layout, { ...first.centre, y: 4 })).toBeUndefined();
  });

  it("follows each poster's tilt", () => {
    const tilted = layout.posters.find(
      (p) => Math.abs(p.tiltRad) > POSTER_SIZES.maxTiltRad / 3,
    );
    if (tilted === undefined) throw new Error("no tilted poster");
    const i = layout.posters.indexOf(tilted);
    // Just inside the tilted top-right corner, which an untilted box test can miss.
    const [, , topRight] = tilted.quad.corners;
    const p = {
      x: topRight.x + (tilted.centre.x - topRight.x) * 0.02,
      y: topRight.y + (tilted.centre.y - topRight.y) * 0.02,
      z: topRight.z,
    };
    expect(posterAt(layout, p)).toBe(i);
  });

  it("finds nothing on a wall with no posters", () => {
    expect(posterAt(graffitiLayout(0, 1), backSpot().position)).toBeUndefined();
  });
});

describe("posterVertexFlags", () => {
  it("flags every poster vertex and none of the paint's, in mesh order", () => {
    const layout = graffitiLayout(3, 1);
    const flags = posterVertexFlags(layout);
    const vertices =
      atlasQuadGeometryData([layout.wall, ...layout.posters.map((p) => p.quad)])
        .positions.length / 3;
    expect(flags).toHaveLength(vertices);
    expect(flags.slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(flags.slice(4)).toEqual(Array<number>(12).fill(1));
  });

  it("flags nothing but the paint on a wall with no posters", () => {
    expect(posterVertexFlags(graffitiLayout(0, 1))).toEqual([0, 0, 0, 0]);
  });
});

describe("posterGlowScale", () => {
  it("raises the posters to the lit intensity only while highlighted", () => {
    expect(posterGlowScale(false, 0.28, 0.5)).toBe(1);
    expect(posterGlowScale(true, 0.28, 0.5) * 0.28).toBeCloseTo(0.5);
  });

  it("leaves the glow alone when the base intensity is zero", () => {
    expect(posterGlowScale(true, 0, 0.5)).toBe(1);
  });
});

describe("clearRects", () => {
  const layout = graffitiLayout(4, 7);
  const wall = layout.wallRect;
  const pxPerM = wall.width / TAG_AREA.widthM;
  const pyPerM = wall.height / (TAG_AREA.topY - TAG_AREA.bottomY);
  /** A pixel of the tag layer back on the wall: along it (facing it) and up. */
  const toWall = (x: number, y: number): { along: number; y: number } => ({
    along: (x - wall.x) / pxPerM - TAG_AREA.widthM / 2,
    y: TAG_AREA.topY - (y - wall.y) / pyPerM,
  });
  const inside = (along: number, y: number): boolean =>
    layout.clearRects.some((r) => {
      const a = toWall(r.x, r.y + r.height);
      const b = toWall(r.x + r.width, r.y);
      return along > a.along && along < b.along && y > a.y && y < b.y;
    });

  it("clears every glass window's frame on the back wall and the exit sign (task 34), and only those", () => {
    const glass = [...glassRects("back"), ...paintClearRects("back")];
    expect(glass.length).toBeGreaterThan(paintClearRects("back").length);
    expect(paintClearRects("back")).toHaveLength(1);
    expect(layout.clearRects).toHaveLength(glass.length);
    layout.clearRects.forEach((r, i) => {
      const frame = glass[i];
      if (frame === undefined) throw new Error("no frame");
      // Inside the tag layer's band of the atlas.
      expect(r.x).toBeGreaterThanOrEqual(wall.x);
      expect(r.y).toBeGreaterThanOrEqual(wall.y);
      expect(r.x + r.width).toBeLessThanOrEqual(wall.x + wall.width);
      expect(r.y + r.height).toBeLessThanOrEqual(wall.y + wall.height);
      // Covers the frame, give or take one pixel for rounding outwards.
      const lo = toWall(r.x, r.y + r.height);
      const hi = toWall(r.x + r.width, r.y);
      const px = 1 / pxPerM + EPS;
      const py = 1 / pyPerM + EPS;
      expect(lo.along).toBeLessThanOrEqual(frame.minAlong + EPS);
      expect(lo.along).toBeGreaterThan(frame.minAlong - px);
      expect(hi.along).toBeGreaterThanOrEqual(frame.maxAlong - EPS);
      expect(hi.along).toBeLessThan(frame.maxAlong + px);
      expect(lo.y).toBeLessThanOrEqual(frame.minY + EPS);
      expect(lo.y).toBeGreaterThan(frame.minY - py);
      // The second storey's windows reach past the paint's top edge: cut there.
      const top = Math.min(frame.maxY, TAG_AREA.topY);
      expect(hi.y).toBeGreaterThanOrEqual(top - EPS);
      expect(hi.y).toBeLessThan(top + py);
    });
  });

  it("leaves the paint on the doors, the boarded windows, the sills and the posters", () => {
    const painted = wallOpenings().filter(
      (o) => o.side === "back" && (o.kind === "door" || o.look === "boarded"),
    );
    expect(painted.length).toBeGreaterThan(0);
    for (const o of painted) {
      const r = openingRect(o);
      expect(inside(o.alongM, (r.minY + r.maxY) / 2)).toBe(false);
    }
    // Just under each window's frame (its sill) stays painted.
    for (const frame of glassRects("back"))
      expect(
        inside((frame.minAlong + frame.maxAlong) / 2, frame.minY - 0.05),
      ).toBe(false);
    for (const poster of layout.posters)
      expect(inside(poster.across, poster.centre.y)).toBe(false);
  });
});

describe("weathering on the paint (task 22)", () => {
  const layout = graffitiLayout(3, 1);

  it("runs the wall's water streaks and rust runs over the tag layer", () => {
    const streaks = weatherStreaks(layout);
    expect(streaks.length).toBeGreaterThan(10);
    const w = layout.wallRect;
    for (const { rect, color, strength } of streaks) {
      expect(rect.x).toBeGreaterThanOrEqual(w.x);
      expect(rect.x + rect.width).toBeLessThanOrEqual(w.x + w.width);
      expect(rect.y).toBeGreaterThanOrEqual(w.y);
      expect(rect.y + rect.height).toBeLessThanOrEqual(w.y + w.height);
      expect([WEATHER_COLORS.water, WEATHER_COLORS.rust]).toContain(color);
      expect(strength).toBeGreaterThan(0);
      expect(strength).toBeLessThanOrEqual(1);
    }
  });

  it("puts stains and paint drips under a few of the back windows' sills", () => {
    const drips = sillDrips(layout);
    const backWindows = wallOpenings().filter(
      (o) => o.side === "back" && o.kind === "window",
    );
    expect(drips).toHaveLength(Math.min(SILL_DRIP_WINDOWS, backWindows.length));
    expect(drips.length).toBeGreaterThanOrEqual(3);
    for (const drip of drips) {
      // Each stain hangs from one back window's sill, as wide as the sill.
      const under = backWindows.find((o) => {
        const sill = wallPixelRect(layout.spot, layout.wallRect, {
          side: "back",
          minAlong: o.alongM - o.widthM / 2 - WINDOW.sillOverhangM,
          maxAlong: o.alongM + o.widthM / 2 + WINDOW.sillOverhangM,
          minY: o.bottomY - WINDOW.sillHeightM - 0.01,
          maxY: o.bottomY - WINDOW.sillHeightM,
        });
        return (
          Math.abs(sill.y - drip.stain.y) <= 1 &&
          sill.x === drip.stain.x &&
          sill.width === drip.stain.width
        );
      });
      expect(under).toBeDefined();
      expect(drip.stain.height).toBeGreaterThan(0);
      expect(drip.runs.length).toBeGreaterThanOrEqual(2);
      for (const run of drip.runs) {
        expect(run.y).toBe(drip.stain.y);
        expect(run.x).toBeGreaterThanOrEqual(drip.stain.x);
        expect(run.x).toBeLessThanOrEqual(drip.stain.x + drip.stain.width);
        expect(run.lengthPx).toBeGreaterThan(0);
        expect([
          ...SILL_DRIP_COLORS.map((token) => PALETTE[token]),
          WEATHER_COLORS.rust,
        ]).toContain(run.color);
      }
    }
    expect(sillDrips(layout)).toEqual(drips);
  });

  it("keeps the drips off the windows' glass, which stays clean", () => {
    for (const drip of sillDrips(layout))
      for (const r of layout.clearRects) {
        const overlaps =
          drip.stain.x < r.x + r.width &&
          r.x < drip.stain.x + drip.stain.width &&
          drip.stain.y < r.y + r.height &&
          r.y < drip.stain.y + drip.stain.height;
        if (overlaps)
          expect(drip.stain.y).toBeGreaterThanOrEqual(r.y + r.height - 1);
      }
  });

  it("has no pale run and no yellow or amber weathering colour", () => {
    expect(SILL_DRIP_COLORS).not.toContain("text");
    for (const hex of Object.values(WEATHER_COLORS)) {
      const n = Number.parseInt(hex.slice(1), 16);
      const r = (n >> 16) & 255;
      const g = (n >> 8) & 255;
      const b = n & 255;
      // Dark red-brown at most: green never above red's share towards yellow.
      expect(g).toBeLessThanOrEqual(r);
      expect((g - b) / Math.max(1, r - b)).toBeLessThan(0.25);
    }
  });
});
