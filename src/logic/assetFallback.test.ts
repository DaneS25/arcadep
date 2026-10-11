import { describe, expect, it } from "vitest";
import {
  buildTextureSet,
  missingAssetsWarning,
  progressPercent,
  progressRatio,
} from "./assetFallback";
import { TEXTURE_FALLBACK_COLORS } from "./assetManifest";

describe("buildTextureSet", () => {
  it("uses every map when all three loaded", () => {
    const { set, unused } = buildTextureSet("brick", {
      color: "c",
      normal: "n",
      roughness: "r",
    });

    expect(set).toEqual({
      slot: "brick",
      textured: true,
      maps: { color: "c", normal: "n", roughness: "r" },
      fallbackColor: TEXTURE_FALLBACK_COLORS.brick,
    });
    expect(unused).toEqual([]);
  });

  it("keeps the colour map when only the normal or roughness map is missing", () => {
    const { set, unused } = buildTextureSet("metal", {
      color: "c",
      normal: null,
      roughness: "r",
    });

    expect(set.textured).toBe(true);
    expect(set.maps).toEqual({ color: "c", normal: null, roughness: "r" });
    expect(unused).toEqual([]);
  });

  it("falls back to the slot's plain colour when the colour map is missing", () => {
    const { set } = buildTextureSet("concrete", {
      color: null,
      normal: null,
      roughness: null,
    });

    expect(set.textured).toBe(false);
    expect(set.fallbackColor).toBe(TEXTURE_FALLBACK_COLORS.concrete);
  });

  it("drops stray maps without a colour map and hands them back for disposal", () => {
    const { set, unused } = buildTextureSet("grate", {
      color: null,
      normal: "n",
      roughness: "r",
    });

    expect(set.maps).toEqual({ color: null, normal: null, roughness: null });
    expect(unused).toEqual(["n", "r"]);
  });
});

describe("missingAssetsWarning", () => {
  it("returns null when nothing is missing", () => {
    expect(missingAssetsWarning([])).toBeNull();
  });

  it("names a single missing asset", () => {
    expect(missingAssetsWarning(["/assets/a.jpg"])).toBe(
      "assets: 1 asset missing or failed, using fallbacks (see public/assets/README.md): /assets/a.jpg",
    );
  });

  it("lists every missing asset in one line", () => {
    const warning = missingAssetsWarning(["/a.jpg", "/b.jpg", "/c.ttf"]);

    expect(warning).toContain("3 assets missing");
    expect(warning).toContain("/a.jpg, /b.jpg, /c.ttf");
  });
});

describe("progressRatio", () => {
  it("divides loaded by total", () => {
    expect(progressRatio(3, 12)).toBe(0.25);
  });

  it("counts nothing to load as finished", () => {
    expect(progressRatio(0, 0)).toBe(1);
  });

  it("clamps to the range 0 to 1", () => {
    expect(progressRatio(5, 4)).toBe(1);
    expect(progressRatio(-1, 4)).toBe(0);
  });

  it("treats non-finite input as finished rather than showing NaN", () => {
    expect(progressRatio(Number.NaN, 4)).toBe(1);
    expect(progressRatio(1, Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("progressPercent", () => {
  it("rounds down so 100% only shows when loading is complete", () => {
    expect(progressPercent(0.999)).toBe(99);
    expect(progressPercent(1)).toBe(100);
  });

  it("clamps out-of-range and non-finite ratios", () => {
    expect(progressPercent(2)).toBe(100);
    expect(progressPercent(-0.5)).toBe(0);
    expect(progressPercent(Number.NaN)).toBe(0);
  });
});
