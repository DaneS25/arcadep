import { describe, expect, it } from "vitest";
import {
  buildingFootprint,
  sideNormal,
  STREET,
  type Box,
} from "./buildingLayout";
import { neonStrips } from "./neonLayout";
import {
  SIDE_DOOR,
  TERMINAL_TEXTURE,
  terminalGeometryData,
  terminalLayout,
} from "./terminalLayout";

const EPS = 1e-9;
const min = (box: Box, axis: "x" | "y" | "z") =>
  box.centre[axis] - box.size[axis] / 2;
const max = (box: Box, axis: "x" | "y" | "z") =>
  box.centre[axis] + box.size[axis] / 2;

describe("terminalLayout", () => {
  const layout = terminalLayout();
  const [housing, door] = layout.parts;

  it("is the right side's spot", () => {
    expect(layout.side).toBe("right");
    expect(layout.id).toBe("spot-right");
  });

  it("fills the spot with the housing", () => {
    expect(housing.centre.x).toBeCloseTo(layout.spot.position.x);
    expect(housing.centre.y).toBeCloseTo(layout.spot.position.y);
    expect(housing.centre.z).toBeCloseTo(layout.spot.position.z);
    expect(housing.size.y).toBeCloseTo(layout.spot.size.y);
  });

  it("stands the door on the pavement, against the right wall, clear of the terminal", () => {
    const wallX = buildingFootprint().maxX;
    expect(sideNormal("right").x).toBe(1);
    expect(min(door, "y")).toBeCloseTo(STREET.curbHeightM);
    expect(door.size.y).toBeCloseTo(SIDE_DOOR.heightM);
    expect(min(door, "x")).toBeCloseTo(wallX);
    expect(max(door, "x")).toBeCloseTo(wallX + SIDE_DOOR.depthM);
    // Along the wall the door and the terminal don't overlap.
    const apart =
      max(door, "z") <= min(housing, "z") + EPS ||
      max(housing, "z") <= min(door, "z") + EPS;
    expect(apart).toBe(true);
  });

  it("keeps the door under the cyan strip over it", () => {
    const strip = neonStrips().find((s) => s.name === "right-door");
    if (strip === undefined) throw new Error("no right-door strip");
    expect(max(door, "y")).toBeLessThan(strip.box.centre.y);
  });

  it("puts the screen above the keypad, both just in front of the housing", () => {
    const [screen, keypad] = layout.faces;
    const top = (quad: typeof screen) =>
      Math.max(...quad.corners.map((c) => c.y));
    const bottom = (quad: typeof screen) =>
      Math.min(...quad.corners.map((c) => c.y));
    expect(bottom(screen)).toBeGreaterThan(top(keypad));
    expect(top(screen)).toBeLessThanOrEqual(max(housing, "y"));
    expect(bottom(keypad)).toBeGreaterThanOrEqual(min(housing, "y"));
    for (const quad of layout.faces) {
      expect(quad.normal).toEqual(sideNormal("right"));
      for (const corner of quad.corners)
        expect(corner.x).toBeGreaterThan(max(housing, "x"));
    }
  });

  it("splits the canvas into the screen and keypad bands", () => {
    const [screen, keypad] = layout.faces;
    expect(screen.vMax).toBe(1);
    expect(keypad.vMin).toBe(0);
    expect(keypad.vMax).toBe(screen.vMin);
    expect(TERMINAL_TEXTURE.housingUv.v).toBeLessThan(keypad.vMax);
  });
});

describe("terminalGeometryData", () => {
  const data = terminalGeometryData();

  it("merges two boxes and two quads into one indexed mesh", () => {
    const vertices = data.positions.length / 3;
    expect(vertices).toBe(2 * 24 + 2 * 4);
    expect(data.normals).toHaveLength(data.positions.length);
    expect(data.uvs).toHaveLength(vertices * 2);
    expect(data.indices).toHaveLength(2 * 36 + 2 * 6);
    for (const i of data.indices) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(vertices);
    }
  });

  it("maps every box vertex to the housing texel and keeps every UV in the texture", () => {
    const { u, v } = TERMINAL_TEXTURE.housingUv;
    expect(data.uvs.slice(0, 2 * 48)).toEqual(
      Array.from({ length: 48 }, () => [u, v]).flat(),
    );
    for (const value of data.uvs) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
