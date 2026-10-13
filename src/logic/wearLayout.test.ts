import { describe, expect, it } from "vitest";
import { boxesGeometryData } from "./boxGeometry";
import { cabinetLayout } from "./cabinetLayout";
import { DETAILS_LOOK } from "./lookConfig";
import { detailGeometryData, detailLayout } from "./detailLayout";
import { PALETTE } from "./palette";
import {
  STICKER_COLORS,
  STICKER_KINDS,
  STICKER_TILE,
  WEAR,
  boxFaceCoords,
  detailWearAttributes,
  stickers,
} from "./wearLayout";

describe("worn edges", () => {
  it("give every box vertex its corner on the face and the face's size", () => {
    const box = { centre: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 3, z: 4 } };
    const { faceUvs, faceSizes } = boxFaceCoords([box]);
    const geometry = boxesGeometryData([box], 1);
    expect(faceUvs).toHaveLength((geometry.positions.length / 3) * 2);
    expect(faceSizes).toHaveLength(faceUvs.length);
    // The +x face is 4 (z) wide and 3 (y) tall: corners from (0, 0) to (4, 3).
    expect(faceUvs.slice(0, 8)).toEqual([0, 0, 4, 0, 4, 3, 0, 3]);
    expect(faceSizes.slice(0, 2)).toEqual([4, 3]);
    // Every corner lies on its face.
    for (let i = 0; i < faceUvs.length; i += 1) {
      expect(faceUvs[i]).toBeGreaterThanOrEqual(0);
      expect(faceUvs[i]).toBeLessThanOrEqual(faceSizes[i] ?? 0);
    }
  });

  it("match the details mesh vertex for vertex, with stickers only on metal, sign boxes and doors", () => {
    const layout = detailLayout();
    const data = detailGeometryData(layout, 1, DETAILS_LOOK.shades);
    const count = data.positions.length / 3;
    const wear = detailWearAttributes(layout, count);
    expect(wear.faceUvs).toHaveLength(count * 2);
    expect(wear.faceSizes).toHaveLength(count * 2);
    expect(wear.stickers).toHaveLength(count);
    layout.boxes.forEach((part, i) => {
      const flag = wear.stickers[i * 24];
      expect(flag).toBe(STICKER_KINDS.includes(part.kind) ? 1 : 0);
    });
    // Beams and quads after the boxes never wear or get stickers.
    for (let v = layout.boxes.length * 24; v < count; v += 1)
      expect(wear.stickers[v]).toBe(0);
    expect(STICKER_KINDS).not.toContain("frame");
    expect(STICKER_KINDS).not.toContain("puddle");
  });

  it("leave thin parts (frames, rods) unworn across their width", () => {
    // The shader treats a face narrower than this as having no edge that way.
    expect(WEAR.edgeM * WEAR.minFaceEdges).toBeGreaterThan(0.1);
    expect(WEAR.coverage).toBeGreaterThan(0);
    expect(WEAR.coverage).toBeLessThan(1);
  });

  it("cover the cabinet's parts too", () => {
    const parts = cabinetLayout().parts;
    expect(boxFaceCoords(parts).faceSizes).toHaveLength(parts.length * 48);
  });

  it("wear to a pale cold grey, and darken the cabinet's base", () => {
    const [r, g, b] = WEAR.color;
    expect(b).toBeGreaterThanOrEqual(r);
    expect(g).toBeLessThanOrEqual(r);
    expect(WEAR.baseStrength).toBeGreaterThan(0);
    expect(WEAR.baseStrength).toBeLessThan(1);
  });
});

describe("stickers", () => {
  it("are the same on every load and stay off the tile's edges", () => {
    const list = stickers();
    expect(list).toEqual(stickers());
    expect(list.length).toBeGreaterThanOrEqual(8);
    for (const s of list) {
      const reach = Math.hypot(s.widthM, s.heightM) / 2;
      expect(s.along - reach).toBeGreaterThan(0);
      expect(s.along + reach).toBeLessThan(STICKER_TILE.tileM);
      expect(s.y - reach).toBeGreaterThan(0);
      expect(s.y + reach).toBeLessThan(STICKER_TILE.tileM);
      expect(s.opacity).toBeGreaterThan(0);
      expect(s.opacity).toBeLessThanOrEqual(1);
      expect(s.ink).not.toBe(s.paper);
    }
  });

  it("use only the palette's colours and a black, no yellow or amber", () => {
    for (const s of stickers()) {
      expect(STICKER_COLORS).toContain(s.paper);
      expect(STICKER_COLORS).toContain(s.ink);
    }
    expect(STICKER_COLORS).toContain(PALETTE.accent);
    for (const hex of STICKER_COLORS) {
      const n = Number.parseInt(hex.slice(1), 16);
      const g = (n >> 8) & 255;
      const b = n & 255;
      // Yellow and amber have green well over blue; these never do.
      expect(g - b).toBeLessThan(40);
    }
  });
});
