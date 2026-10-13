import {
  ImageLoader,
  LoadingManager,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from "three";
import {
  buildTextureSet,
  missingAssetsWarning,
  progressRatio,
  type TextureSet,
} from "@/logic/assetFallback";
import {
  FONTS,
  fontFaceSource,
  fontStack,
  fontUrls,
  textureUrl,
  type FontAsset,
  type FontRole,
  type TextureSlot,
} from "@/logic/assetManifest";

export type LoadedFont = {
  readonly family: string;
  readonly loaded: boolean;
  /** CSS font stack to draw with: the downloaded family if it loaded, else system fonts. */
  readonly stack: string;
};

export type LoadedAssets = {
  readonly textures: Readonly<Record<TextureSlot, TextureSet<Texture>>>;
  readonly fonts: Readonly<Record<FontRole, LoadedFont>>;
  /** Project thumbnails that loaded, by their site path. */
  readonly thumbnails: ReadonlyMap<string, HTMLImageElement>;
  /** URLs of every asset that was missing or failed. */
  readonly missing: readonly string[];
  /** Disposes every texture that loaded. */
  dispose(): void;
};

/** How single assets are fetched. Each call settles, never rejects: `null` or `false` means missing. */
export type AssetSources = {
  loadTexture(url: string): Promise<Texture | null>;
  loadFont(font: FontAsset): Promise<boolean>;
  loadImage(url: string): Promise<HTMLImageElement | null>;
};

/** A `LoadingManager` that reports overall progress from 0 to 1. */
export function createLoadingManager(
  onProgress: (ratio: number) => void,
): LoadingManager {
  const manager = new LoadingManager();
  manager.onProgress = (_url, loaded, total) => {
    onProgress(progressRatio(loaded, total));
  };
  return manager;
}

/** Real sources: `TextureLoader`, `ImageLoader` and the CSS Font Loading API, all tracked by `manager`. */
export function createAssetSources(
  manager: LoadingManager,
  doc: Document,
): AssetSources {
  const textureLoader = new TextureLoader(manager);
  const imageLoader = new ImageLoader(manager);
  return {
    loadTexture(url) {
      return new Promise((resolve) => {
        textureLoader.load(
          url,
          (texture) => {
            texture.wrapS = RepeatWrapping;
            texture.wrapT = RepeatWrapping;
            resolve(texture);
          },
          undefined,
          () => {
            resolve(null);
          },
        );
      });
    },
    loadImage(url) {
      return new Promise((resolve) => {
        imageLoader.load(
          url,
          (image) => {
            resolve(image);
          },
          undefined,
          () => {
            resolve(null);
          },
        );
      });
    },
    loadFont(font) {
      const win = doc.defaultView;
      // jsdom and very old browsers have no Font Loading API: use the system fallback.
      if (win === null || !("FontFace" in win)) return Promise.resolve(false);
      const key = fontUrls(font).join(" or ");
      manager.itemStart(key);
      const face = new win.FontFace(font.family, fontFaceSource(font));
      return face
        .load()
        .then(
          (loadedFace) => {
            doc.fonts.add(loadedFace);
            return true;
          },
          () => {
            manager.itemError(key);
            return false;
          },
        )
        .finally(() => {
          manager.itemEnd(key);
        });
    },
  };
}

/**
 * Loads every optional asset in `public/assets/`, plus the given project thumbnails.
 * Never rejects: a missing or broken file falls back (plain colour, system font,
 * generated poster) and all of them are reported in one warning through `warn`.
 */
export async function loadAssets(
  sources: AssetSources,
  warn: (message: string) => void,
  thumbnailUrls: readonly string[] = [],
): Promise<LoadedAssets> {
  const missing: string[] = [];
  const owned: Texture[] = [];

  const track = async (
    url: string,
    isColor: boolean,
  ): Promise<Texture | null> => {
    const texture = await sources.loadTexture(url);
    if (texture === null) {
      missing.push(url);
      return null;
    }
    if (isColor) texture.colorSpace = SRGBColorSpace;
    return texture;
  };

  const loadSet = async (slot: TextureSlot): Promise<TextureSet<Texture>> => {
    // Start all three requests before awaiting any, so the manager counts them together.
    const pending = [
      track(textureUrl(slot, "color"), true),
      track(textureUrl(slot, "normal"), false),
      track(textureUrl(slot, "roughness"), false),
    ] as const;
    const [color, normal, roughness] = await Promise.all(pending);
    const { set, unused } = buildTextureSet(slot, { color, normal, roughness });
    for (const texture of unused) texture.dispose();
    for (const texture of [set.maps.color, set.maps.normal, set.maps.roughness])
      if (texture !== null) owned.push(texture);
    return set;
  };

  const loadFont = async (font: FontAsset): Promise<LoadedFont> => {
    const loaded = await sources.loadFont(font);
    if (!loaded) missing.push(fontUrls(font).join(" or "));
    return { family: font.family, loaded, stack: fontStack(font, loaded) };
  };

  const textures = {
    concrete: loadSet("concrete"),
    brick: loadSet("brick"),
    asphalt: loadSet("asphalt"),
    metal: loadSet("metal"),
    grate: loadSet("grate"),
  };
  const loadThumbnail = async (
    url: string,
  ): Promise<readonly [string, HTMLImageElement] | null> => {
    const image = await sources.loadImage(url);
    if (image === null) {
      missing.push(url);
      return null;
    }
    return [url, image];
  };

  const fonts = {
    neon: loadFont(FONTS.neon),
    mono: loadFont(FONTS.mono),
    marker: loadFont(FONTS.marker),
  };
  const thumbnails = Promise.all(
    [...new Set(thumbnailUrls)].map((url) => loadThumbnail(url)),
  );

  const result: LoadedAssets = {
    textures: {
      concrete: await textures.concrete,
      brick: await textures.brick,
      asphalt: await textures.asphalt,
      metal: await textures.metal,
      grate: await textures.grate,
    },
    fonts: {
      neon: await fonts.neon,
      mono: await fonts.mono,
      marker: await fonts.marker,
    },
    thumbnails: new Map((await thumbnails).filter((entry) => entry !== null)),
    missing,
    dispose() {
      for (const texture of owned) texture.dispose();
      owned.length = 0;
    },
  };

  missing.sort();
  const warning = missingAssetsWarning(missing);
  if (warning !== null) warn(warning);
  return result;
}
