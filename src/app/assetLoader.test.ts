import { NoColorSpace, SRGBColorSpace, Texture } from "three";
import { describe, expect, it, vi } from "vitest";
import { textureUrl } from "@/logic/assetManifest";
import {
  createAssetSources,
  createLoadingManager,
  loadAssets,
  type AssetSources,
} from "./assetLoader";

/** Sources that serve the given texture URLs and font families; everything else is missing. */
function fakeSources(
  textureUrls: readonly string[],
  families: readonly string[] = [],
  imageUrls: readonly string[] = [],
): AssetSources & { created: Map<string, Texture> } {
  const created = new Map<string, Texture>();
  return {
    created,
    loadTexture(url) {
      if (!textureUrls.includes(url)) return Promise.resolve(null);
      const texture = new Texture();
      created.set(url, texture);
      return Promise.resolve(texture);
    },
    loadFont(font) {
      return Promise.resolve(families.includes(font.family));
    },
    loadImage(url) {
      return Promise.resolve(
        imageUrls.includes(url) ? document.createElement("img") : null,
      );
    },
  };
}

const BRICK_URLS = [
  textureUrl("brick", "color"),
  textureUrl("brick", "normal"),
  textureUrl("brick", "roughness"),
];

describe("loadAssets", () => {
  it("falls back everywhere and warns once when the assets folder is empty", async () => {
    const warn = vi.fn();

    const assets = await loadAssets(fakeSources([]), warn);

    expect(assets.textures.concrete.textured).toBe(false);
    expect(assets.textures.grate.textured).toBe(false);
    expect(assets.fonts.neon).toEqual({
      family: "Orbitron",
      loaded: false,
      stack: '"Arial Black", sans-serif',
    });
    expect(assets.missing).toHaveLength(5 * 3 + 3);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not warn when every asset loads", async () => {
    const all = (
      ["concrete", "brick", "asphalt", "metal", "grate"] as const
    ).flatMap((slot) =>
      (["color", "normal", "roughness"] as const).map((kind) =>
        textureUrl(slot, kind),
      ),
    );
    const warn = vi.fn();

    const assets = await loadAssets(
      fakeSources(all, ["Orbitron", "Share Tech Mono", "Permanent Marker"]),
      warn,
    );

    expect(assets.missing).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    expect(assets.fonts.mono.stack).toBe(
      '"Share Tech Mono", "Consolas", monospace',
    );
  });

  it("marks only colour maps as sRGB", async () => {
    const sources = fakeSources(BRICK_URLS);

    const assets = await loadAssets(sources, vi.fn());

    expect(assets.textures.brick.maps.color?.colorSpace).toBe(SRGBColorSpace);
    expect(assets.textures.brick.maps.normal?.colorSpace).toBe(NoColorSpace);
    expect(assets.textures.brick.maps.roughness?.colorSpace).toBe(NoColorSpace);
  });

  it("disposes stray maps of a material whose colour map is missing", async () => {
    const normalUrl = textureUrl("metal", "normal");
    const sources = fakeSources([normalUrl]);
    const onDispose = vi.fn();
    const loading = loadAssets(sources, vi.fn());
    sources.created.get(normalUrl)?.addEventListener("dispose", onDispose);

    const assets = await loading;

    expect(assets.textures.metal.maps.normal).toBeNull();
    expect(onDispose).toHaveBeenCalledTimes(1);
  });

  it("disposes every texture it kept when disposed", async () => {
    const sources = fakeSources(BRICK_URLS);
    const assets = await loadAssets(sources, vi.fn());
    const onDispose = vi.fn();
    for (const texture of sources.created.values())
      texture.addEventListener("dispose", onDispose);

    assets.dispose();

    expect(onDispose).toHaveBeenCalledTimes(3);
  });

  it("loads project thumbnails once each and reports the missing ones in the same warning", async () => {
    const warn = vi.fn();
    const found = "/assets/thumbnails/a.png";
    const lost = "/assets/thumbnails/b.png";

    const assets = await loadAssets(fakeSources([], [], [found]), warn, [
      found,
      lost,
      found,
    ]);

    expect([...assets.thumbnails.keys()]).toEqual([found]);
    expect(assets.missing).toContain(lost);
    expect(assets.missing).not.toContain(found);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain(lost);
  });

  it("lists missing assets in a stable sorted order", async () => {
    const assets = await loadAssets(fakeSources([]), vi.fn());

    expect([...assets.missing]).toEqual([...assets.missing].sort());
  });
});

describe("createLoadingManager", () => {
  it("reports progress as a ratio", () => {
    const onProgress = vi.fn();
    const manager = createLoadingManager(onProgress);

    manager.itemStart("a");
    manager.itemStart("b");
    manager.itemEnd("a");

    expect(onProgress).toHaveBeenLastCalledWith(0.5);
  });
});

describe("createAssetSources", () => {
  it("reports fonts as missing when the Font Loading API is unavailable", async () => {
    const manager = createLoadingManager(vi.fn());
    const sources = createAssetSources(manager, document);

    await expect(
      sources.loadFont({ family: "Orbitron", fallback: "sans-serif" }),
    ).resolves.toBe(false);
  });
});
