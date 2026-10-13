import { describe, expect, it } from "vitest";
import { interactionSpots, sideNormal, type Box } from "./buildingLayout";
import {
  MAX_SIGNS,
  SIGN_TEXTURE,
  atlasBand,
  signColors,
  signColumns,
  skillSignsLayout,
} from "./skillSignsLayout";

const EPS = 1e-9;

function leftSpotBox(): Box {
  const spot = interactionSpots().find((s) => s.side === "left");
  if (spot === undefined) throw new Error("no left spot");
  // The left wall faces -x, so the spot's depth runs along x and its width along z.
  return {
    centre: spot.position,
    size: { x: spot.size.z, y: spot.size.y, z: spot.size.x },
  };
}

function within(inner: Box, outer: Box): boolean {
  return (["x", "y", "z"] as const).every(
    (a) =>
      inner.centre[a] - inner.size[a] / 2 >=
        outer.centre[a] - outer.size[a] / 2 - EPS &&
      inner.centre[a] + inner.size[a] / 2 <=
        outer.centre[a] + outer.size[a] / 2 + EPS,
  );
}

function overlaps(a: Box, b: Box): boolean {
  return (["x", "y", "z"] as const).every(
    (k) =>
      Math.abs(a.centre[k] - b.centre[k]) < (a.size[k] + b.size[k]) / 2 - EPS,
  );
}

describe("skill signs layout", () => {
  it("places one sign per skill on the left spot, keeping its id", () => {
    const layout = skillSignsLayout(6);
    expect(layout.side).toBe("left");
    expect(layout.id).toBe("spot-left");
    expect(layout.signs).toHaveLength(6);
  });

  it("keeps every plate inside the spot and apart from the others", () => {
    for (const count of [1, 2, 3, 5, 6, 9, MAX_SIGNS]) {
      const { signs } = skillSignsLayout(count);
      const spot = leftSpotBox();
      for (const sign of signs) expect(within(sign.plate, spot)).toBe(true);
      for (let i = 0; i < signs.length; i += 1)
        for (let j = i + 1; j < signs.length; j += 1) {
          const a = signs[i];
          const b = signs[j];
          if (a === undefined || b === undefined) continue;
          expect(overlaps(a.plate, b.plate)).toBe(false);
        }
    }
  });

  it("puts each glowing face just in front of its plate, facing out", () => {
    const { signs } = skillSignsLayout(6);
    const n = sideNormal("left");
    for (const sign of signs) {
      expect(sign.quad.normal).toEqual(n);
      const front = sign.plate.centre.x + (n.x * sign.plate.size.x) / 2;
      for (const corner of sign.quad.corners)
        expect(corner.x * n.x).toBeGreaterThan(front * n.x);
    }
  });

  it("keeps the sign quads at the atlas cell's shape", () => {
    const layout = skillSignsLayout(6);
    expect(layout.widthM / layout.heightM).toBeCloseTo(
      SIGN_TEXTURE.cellWidthPx / SIGN_TEXTURE.cellHeightPx,
    );
    expect(layout.atlas.heightPx).toBe(6 * SIGN_TEXTURE.cellHeightPx);
  });

  it("caps the signs drawn and copes with none", () => {
    expect(skillSignsLayout(MAX_SIGNS + 5).signs).toHaveLength(MAX_SIGNS);
    const empty = skillSignsLayout(0);
    expect(empty.signs).toHaveLength(0);
    expect(empty.atlas.heightPx).toBe(SIGN_TEXTURE.cellHeightPx);
  });

  it("gives each sign its own band of atlas rows, top to bottom", () => {
    expect(atlasBand(0, 4)).toEqual({ vMin: 0.75, vMax: 1 });
    expect(atlasBand(3, 4)).toEqual({ vMin: 0, vMax: 0.25 });
    expect(signColumns(2)).toBe(2);
    expect(signColumns(7)).toBe(3);
    expect(signColumns(0)).toBe(1);
  });

  it("colours signs by group, in turn", () => {
    expect(signColors(["A", "A", "B", "C", "D", "B"])).toEqual([
      "accent",
      "accent",
      "cyan",
      "violet",
      "accent",
      "cyan",
    ]);
  });
});
