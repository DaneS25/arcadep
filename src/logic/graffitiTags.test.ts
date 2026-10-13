import { describe, expect, it } from "vitest";
import { floorLevels } from "./buildingLayout";
import { GRAFFITI_TEXTURE, TAG_AREA } from "./graffitiLayout";
import {
  BUFF_COLORS,
  GRAFFITI_LAYERS,
  OUTLINE_COLORS,
  TAG_COLORS,
  TAG_SIZES,
  graffitiArt,
  tagBounds,
  tagName,
  throwupName,
  type TagSpec,
} from "./graffitiTags";
import { createRng } from "./rng";

const ASPECT = GRAFFITI_TEXTURE.widthPx / GRAFFITI_TEXTURE.wallHeightPx;

describe("tagName and throwupName", () => {
  it("makes upper-case tag names of 4 to 7 letters", () => {
    const rng = createRng(11);
    for (let i = 0; i < 200; i += 1) {
      expect(tagName(rng)).toMatch(/^[A-Z]{4,7}$/);
    }
  });

  it("makes short upper-case throw-up names of 2 to 4 letters", () => {
    const rng = createRng(12);
    for (let i = 0; i < 200; i += 1) {
      expect(throwupName(rng)).toMatch(/^[A-Z]{2,4}$/);
    }
  });
});

describe("graffitiArt", () => {
  it("is the same for the same seed and differs for another", () => {
    expect(graffitiArt(5)).toEqual(graffitiArt(5));
    expect(graffitiArt(5)).not.toEqual(graffitiArt(6));
  });

  it("paints buffs, then throw-ups, then tags, then scrawls, in that order", () => {
    const art = graffitiArt(7);
    const L = GRAFFITI_LAYERS;
    const throwups = L.throwup.columns * L.throwup.rows;
    const tags = L.tag.columns * L.tag.rows;
    expect(art.buffs).toHaveLength(L.buff.count);
    expect(art.tags).toHaveLength(throwups + tags + L.scrawl.count);
    const order = { throwup: 0, fill: 1, outline: 1, drip: 1, scrawl: 2 };
    const ranks = art.tags.map((t) => order[t.style]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(art.tags.map((t) => t.style))).toEqual(
      new Set(["throwup", "fill", "outline", "drip", "scrawl"]),
    );
  });

  it("keeps every piece inside the layer, with sizes, angles and colours in range", () => {
    const L = GRAFFITI_LAYERS;
    const layerOf = (t: TagSpec) =>
      t.style === "throwup"
        ? L.throwup
        : t.style === "scrawl"
          ? L.scrawl
          : L.tag;
    for (const seed of [1, 2, 3, 4]) {
      const art = graffitiArt(seed);
      for (const tag of art.tags) {
        const layer = layerOf(tag);
        expect(tag.x).toBeGreaterThanOrEqual(TAG_SIZES.edge);
        expect(tag.x).toBeLessThanOrEqual(1 - TAG_SIZES.edge);
        expect(tag.y).toBeGreaterThanOrEqual(TAG_SIZES.edge);
        expect(tag.y).toBeLessThanOrEqual(1 - TAG_SIZES.edge);
        expect(tag.size).toBeGreaterThanOrEqual(layer.minSize);
        expect(tag.size).toBeLessThanOrEqual(layer.maxSize);
        expect(Math.abs(tag.angleRad)).toBeLessThanOrEqual(layer.maxAngleRad);
        expect(TAG_COLORS).toContain(tag.color);
        expect(OUTLINE_COLORS).toContain(tag.outline);
        if (tag.style === "drip") expect(tag.drips.length).toBeGreaterThan(0);
        if (tag.style !== "drip" && tag.style !== "throwup")
          expect(tag.drips).toHaveLength(0);
        expect(tag.drips.length).toBeLessThanOrEqual(TAG_SIZES.maxDrips);
        for (const drip of tag.drips) {
          expect(Math.abs(drip.at)).toBeLessThanOrEqual(0.5);
          expect(drip.length).toBeGreaterThan(0);
        }
      }
      for (const buff of art.buffs) {
        expect(buff.x - buff.width / 2).toBeGreaterThanOrEqual(0);
        expect(buff.x + buff.width / 2).toBeLessThanOrEqual(1);
        expect(buff.y - buff.height / 2).toBeGreaterThanOrEqual(0);
        expect(buff.y + buff.height / 2).toBeLessThanOrEqual(1);
        expect(BUFF_COLORS).toContain(buff.color);
      }
    }
  });

  it("fills the wall: every part of a 4 x 3 grid over it has several pieces", () => {
    for (const seed of [1, 2, 3]) {
      const big = graffitiArt(seed).tags.filter((t) => t.style !== "scrawl");
      for (let col = 0; col < 4; col += 1)
        for (let row = 0; row < 3; row += 1) {
          const inCell = big.filter(
            (t) => Math.floor(t.x * 4) === col && Math.floor(t.y * 3) === row,
          );
          expect(inCell.length).toBeGreaterThanOrEqual(3);
        }
    }
  });

  it("reaches up into the second storey", () => {
    const secondFloorY = floorLevels()[2]?.baseY ?? 0;
    const height = TAG_AREA.topY - TAG_AREA.bottomY;
    // y runs down from the layer's top edge.
    const lineFromTop = (TAG_AREA.topY - secondFloorY) / height;
    const art = graffitiArt(3);
    const above = art.tags.filter(
      (t) => t.style !== "scrawl" && tagBounds(t, ASPECT).minY < lineFromTop,
    );
    expect(above.length).toBeGreaterThanOrEqual(4);
  });

  it("overlaps its pieces, so the layers look chaotic", () => {
    const tags = graffitiArt(3).tags;
    const boxes = tags.map((t) => tagBounds(t, ASPECT));
    let overlapping = 0;
    boxes.forEach((a, i) => {
      const hit = boxes.some(
        (b, j) =>
          j !== i &&
          a.minX < b.maxX &&
          b.minX < a.maxX &&
          a.minY < b.maxY &&
          b.minY < a.maxY,
      );
      if (hit) overlapping += 1;
    });
    expect(overlapping / tags.length).toBeGreaterThan(0.5);
  });
});

describe("tagBounds", () => {
  it("is as wide as the letters, scaled to the layer's shape", () => {
    const tag: TagSpec = {
      text: "ABCD",
      x: 0.5,
      y: 0.5,
      size: 0.1,
      angleRad: 0,
      color: "accent",
      outline: "base",
      style: "fill",
      drips: [],
    };
    const b = tagBounds(tag, 2);
    expect(b.maxX - b.minX).toBeCloseTo((4 * 0.62 * 0.1) / 2);
    expect(b.maxY - b.minY).toBeCloseTo(0.1);
  });
});
