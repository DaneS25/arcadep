import { describe, expect, it } from "vitest";
import {
  TAG_COLORS,
  TAG_GRID,
  TAG_SIZES,
  graffitiTags,
  tagName,
} from "./graffitiTags";
import { createRng } from "./rng";

describe("tagName", () => {
  it("makes upper-case names of 4 to 7 letters", () => {
    const rng = createRng(11);
    for (let i = 0; i < 200; i += 1) {
      const name = tagName(rng);
      expect(name).toMatch(/^[A-Z]{4,7}$/);
    }
  });
});

describe("graffitiTags", () => {
  it("is the same for the same seed and differs for another", () => {
    expect(graffitiTags(5)).toEqual(graffitiTags(5));
    expect(graffitiTags(5)).not.toEqual(graffitiTags(6));
  });

  it("puts one tag in each grid cell, inside the layer's edges", () => {
    const tags = graffitiTags(99);
    expect(tags).toHaveLength(TAG_GRID.columns * TAG_GRID.rows);
    const span = 1 - 2 * TAG_SIZES.edge;
    tags.forEach((tag, i) => {
      const col = i % TAG_GRID.columns;
      const row = Math.floor(i / TAG_GRID.columns);
      const cellX = (tag.x - TAG_SIZES.edge) / (span / TAG_GRID.columns);
      const cellY = (tag.y - TAG_SIZES.edge) / (span / TAG_GRID.rows);
      expect(Math.floor(cellX)).toBe(col);
      expect(Math.floor(cellY)).toBe(row);
      expect(tag.x).toBeGreaterThan(TAG_SIZES.edge);
      expect(tag.x).toBeLessThan(1 - TAG_SIZES.edge);
    });
  });

  it("keeps sizes, angles and colours in range, with drips only on drip tags", () => {
    for (const seed of [1, 2, 3, 4]) {
      for (const tag of graffitiTags(seed)) {
        expect(tag.size).toBeGreaterThanOrEqual(TAG_SIZES.minSize);
        expect(tag.size).toBeLessThanOrEqual(TAG_SIZES.maxSize);
        expect(Math.abs(tag.angleRad)).toBeLessThanOrEqual(
          TAG_SIZES.maxAngleRad,
        );
        expect(TAG_COLORS).toContain(tag.color);
        if (tag.style === "drip") {
          expect(tag.drips.length).toBeGreaterThan(0);
          expect(tag.drips.length).toBeLessThanOrEqual(TAG_SIZES.maxDrips);
        } else {
          expect(tag.drips).toHaveLength(0);
        }
        for (const drip of tag.drips) {
          expect(Math.abs(drip.at)).toBeLessThanOrEqual(0.5);
          expect(drip.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
