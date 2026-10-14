import { describe, expect, it } from "vitest";
import {
  BUILDING,
  alleyWallBox,
  interactionSpots,
  openingRect,
  pointOnSide,
  sideNormal,
  sideOffsetM,
  sideTangent,
  wallOpenings,
  type Box,
  type Side,
  type Vec3,
} from "./buildingLayout";
import { CAMERA } from "./cameraOrbit";
import {
  detailLayout,
  roofTopY,
  signPlateVertices,
  VERTICES_PER_BOX,
  withSignPlates,
} from "./detailLayout";
import {
  BACK_LAMP,
  DUCT,
  backLampParts,
  backLampPosition,
  ductLayout,
  steamVents,
  withDucts,
} from "./ductLayout";
import { LAMP_LOOK } from "./lookConfig";
import { neonStrips } from "./neonLayout";
import { skillSignsLayout } from "./skillSignsLayout";
import { FIRE_ESCAPE, windowLayout, withWindows } from "./windowLayout";

const EPS = 1e-9;

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

/** A box's along/up extents on a side's wall and its out range from the wall. */
function onWall(box: Box, side: Side) {
  const t = sideTangent(side);
  const n = sideNormal(side);
  const along = dot(box.centre, t);
  const ha = Math.abs(dot(box.size, t)) / 2;
  const out = dot(box.centre, n) - sideOffsetM(side);
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

const BUILDING_SOLID: Box = {
  centre: { x: 0, y: roofTopY() / 2, z: 0 },
  size: { x: BUILDING.widthM, y: roofTopY(), z: BUILDING.depthM },
};

const SIDES: readonly Side[] = ["front", "right", "back", "left"];

describe("ductLayout", () => {
  const ducts = ductLayout().boxes;

  it("adds ducts, pipes, vents and a lamp round the building", () => {
    expect(ducts.length).toBeGreaterThan(40);
    const kinds = new Set(ducts.map((part) => part.kind));
    for (const kind of ["metal", "plate", "lamp"] as const)
      expect(kinds.has(kind)).toBe(true);
    // Something new on every side and on the roof.
    for (const side of SIDES) {
      const onThisWall = ducts.filter((part) => {
        const r = onWall(part.box, side);
        return r.nearOut > -EPS && r.nearOut < 0.6 && r.minY > 0.5;
      });
      expect(onThisWall.length, side).toBeGreaterThan(0);
    }
    expect(ducts.some((part) => part.box.centre.y > roofTopY() + 0.5)).toBe(
      true,
    );
  });

  it("keeps out of the walls and off every existing prop, window, door, sign, neon tube and spot", () => {
    const others: Box[] = [
      ...detailLayout().boxes.map((part) => part.box),
      ...windowLayout().boxes.map((part) => part.box),
      ...neonStrips().map((strip) => strip.box),
      ...skillSignsLayout(12).signs.map((sign) => sign.plate),
      alleyWallBox(),
    ];
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
    for (const { box } of ducts) {
      expect(overlaps(box, BUILDING_SOLID)).toBe(false);
      for (const other of [...others, ...spots])
        expect(overlaps(box, other), JSON.stringify(box)).toBe(false);
    }
  });

  it("keeps the wall parts clear of every window and door on their wall", () => {
    for (const side of SIDES)
      for (const { box } of ducts) {
        const r = onWall(box, side);
        if (r.farOut < EPS || r.nearOut > 0.6 || r.minY < 0.1) continue;
        for (const o of wallOpenings().filter((x) => x.side === side)) {
          const w = openingRect(o);
          const clear =
            r.maxAlong <= w.minAlong + EPS ||
            r.minAlong >= w.maxAlong - EPS ||
            r.maxY <= w.minY - 0.08 + EPS ||
            r.minY >= w.maxY - EPS;
          expect(clear, `${side} ${JSON.stringify(r)}`).toBe(true);
        }
      }
  });

  it("runs the risers up past the parapet to cowls over it", () => {
    expect(DUCT.topY).toBeGreaterThan(roofTopY() + BUILDING.parapetHeightM);
    const risers = ducts.filter((part) => part.box.size.y > 5);
    expect(risers).toHaveLength(2);
    for (const { box } of risers)
      expect(box.centre.y + box.size.y / 2).toBeCloseTo(DUCT.topY, 9);
  });

  it("stays where the orbiting camera can never reach", () => {
    const lowest =
      CAMERA.target.y + CAMERA.minDistanceM * Math.cos(CAMERA.maxPolarRad);
    for (const p of ducts.flatMap((part) => corners(part.box))) {
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
});

describe("the back door lamp", () => {
  const parts = backLampParts();
  const door = wallOpenings().find(
    (o) =>
      o.side === "back" &&
      o.door === "back" &&
      Math.abs(o.alongM - BACK_LAMP.alongM) < 0.01,
  );
  const fireEscape = wallOpenings().find((o) => o.door === "fireEscape");

  it("hangs over a back door, under the fire escape's landing", () => {
    if (door === undefined || fireEscape === undefined)
      throw new Error("no back door or fire escape");
    const lamp = backLampPosition();
    const r = onWall(
      { centre: lamp, size: { x: 0, y: 0, z: 0 } },
      BACK_LAMP.side,
    );
    expect(Math.abs(r.minAlong - door.alongM)).toBeLessThan(0.01);
    for (const { box } of parts) {
      const p = onWall(box, "back");
      expect(p.minY).toBeGreaterThan(door.bottomY + door.heightM);
      expect(p.maxY).toBeLessThan(
        fireEscape.bottomY - FIRE_ESCAPE.landing.up - 1,
      );
      expect(p.minAlong).toBeGreaterThan(door.alongM - door.widthM / 2);
      expect(p.maxAlong).toBeLessThan(door.alongM + door.widthM / 2);
    }
  });

  it("has one glowing bulb inside a cage of four bars", () => {
    const bulbs = parts.filter((part) => part.kind === "lamp");
    expect(bulbs).toHaveLength(1);
    const bulb = bulbs[0];
    if (bulb === undefined) throw new Error("no bulb");
    const lamp = backLampPosition();
    expect(bulb.box.centre.x).toBeCloseTo(lamp.x, 9);
    expect(bulb.box.centre.y).toBeCloseTo(lamp.y, 9);
    expect(bulb.box.centre.z).toBeCloseTo(lamp.z, 9);
    const bars = parts.filter(
      (part) =>
        part.kind === "metal" &&
        part.box.size.y > BACK_LAMP.bulbM &&
        Math.max(part.box.size.x, part.box.size.z) < 0.02,
    );
    expect(bars).toHaveLength(4);
    for (const { box } of bars) {
      expect(overlaps(box, bulb.box)).toBe(false);
      expect(box.centre.y - box.size.y / 2).toBeLessThan(
        bulb.box.centre.y - BACK_LAMP.bulbM / 2,
      );
      expect(box.centre.y + box.size.y / 2).toBeGreaterThan(
        bulb.box.centre.y + BACK_LAMP.bulbM / 2,
      );
    }
  });

  it("lights the door, the fire escape above it and the steam beside it, but not the far door", () => {
    if (door === undefined || fireEscape === undefined)
      throw new Error("no back door or fire escape");
    const lamp = backLampPosition();
    const reach = (p: Vec3): number =>
      Math.hypot(p.x - lamp.x, p.y - lamp.y, p.z - lamp.z);
    const landing = pointOnSide(
      "back",
      fireEscape.alongM,
      fireEscape.bottomY,
      FIRE_ESCAPE.gapM + FIRE_ESCAPE.landing.out / 2,
    );
    expect(reach(landing)).toBeLessThan(LAMP_LOOK.distanceM / 2);
    const grate = steamVents().find((v) => v.id === "back-grate");
    if (grate === undefined) throw new Error("no grate");
    expect(reach(grate.position)).toBeLessThan(LAMP_LOOK.distanceM / 2);
    const farDoor = pointOnSide("back", -door.alongM, 1, 0);
    expect(reach(farDoor)).toBeGreaterThan(LAMP_LOOK.distanceM);
  });
});

describe("steamVents", () => {
  const vents = steamVents();
  const parts = ductLayout().boxes;

  it("lets steam out of several vents, each with a unit direction out of its wall or up", () => {
    expect(vents.length).toBeGreaterThanOrEqual(5);
    expect(new Set(vents.map((v) => v.id)).size).toBe(vents.length);
    for (const v of vents) {
      const d = v.direction;
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 9);
      expect(d.y >= 0).toBe(true);
      expect(v.strength).toBeGreaterThan(0);
      expect(v.strength).toBeLessThanOrEqual(1);
      expect(v.sizeM).toBeGreaterThan(0);
      // Out of the building, never inside it.
      const inside =
        Math.abs(v.position.x) < BUILDING.widthM / 2 &&
        Math.abs(v.position.z) < BUILDING.depthM / 2 &&
        v.position.y < roofTopY();
      expect(inside, v.id).toBe(false);
    }
  });

  it("puts every vent at the mouth of a pipe, duct or stack (or the roof vent from task 14)", () => {
    const all = [...parts, ...detailLayout().boxes];
    for (const v of vents) {
      const near = all.some(({ box }) =>
        (["x", "y", "z"] as const).every(
          (axis) =>
            Math.abs(v.position[axis] - box.centre[axis]) <=
            box.size[axis] / 2 + 0.12,
        ),
      );
      expect(near, v.id).toBe(true);
    }
  });
});

describe("withDucts", () => {
  it("adds the ducts after the layout's own parts and keeps the sign plates last", () => {
    const base = detailLayout();
    const withAll = withDucts(base);
    expect(withAll.boxes.slice(0, base.boxes.length)).toEqual(base.boxes);
    expect(withAll.boxes.length).toBe(
      base.boxes.length + ductLayout().boxes.length,
    );
    const plates = [
      {
        centre: { x: -7, y: 6, z: 0 },
        size: { x: 0.1, y: 0.5, z: 1 },
      },
    ];
    const layout = withSignPlates(withWindows(withAll), plates);
    expect(signPlateVertices(layout)).toEqual({
      start: (layout.boxes.length - 1) * VERTICES_PER_BOX,
      count: VERTICES_PER_BOX,
    });
  });
});
