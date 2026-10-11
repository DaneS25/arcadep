import {
  TEXTURE_FALLBACK_COLORS,
  TEXTURE_MAP_KINDS,
  type TextureMapKind,
  type TextureSlot,
} from "./assetManifest";

/** The maps one material ended up with. `null` means the map is not used. */
export type TextureMaps<T> = Readonly<Record<TextureMapKind, T | null>>;

export type TextureSet<T> = {
  readonly slot: TextureSlot;
  /** True when the colour map loaded, so the material uses textures. */
  readonly textured: boolean;
  readonly maps: TextureMaps<T>;
  /** Plain colour for an untextured material (also a tint base for a textured one). */
  readonly fallbackColor: string;
};

export type TextureSetResult<T> = {
  set: TextureSet<T>;
  /** Maps that loaded but are not used, so the caller can dispose them. */
  unused: T[];
};

/**
 * Decides what a material uses from the maps that loaded. Without its colour map a
 * material falls back to a plain colour and drops its other maps too, so a stray
 * normal or roughness map never shows on a flat colour.
 */
export function buildTextureSet<T>(
  slot: TextureSlot,
  loaded: TextureMaps<T>,
): TextureSetResult<T> {
  const fallbackColor = TEXTURE_FALLBACK_COLORS[slot];
  if (loaded.color !== null) {
    return {
      set: { slot, textured: true, maps: loaded, fallbackColor },
      unused: [],
    };
  }
  const unused = TEXTURE_MAP_KINDS.map((kind) => loaded[kind]).filter(
    (map): map is T => map !== null,
  );
  return {
    set: {
      slot,
      textured: false,
      maps: { color: null, normal: null, roughness: null },
      fallbackColor,
    },
    unused,
  };
}

/**
 * One warning for every asset that could not be loaded, or `null` when all loaded.
 * A single line keeps the console readable when the assets folder is still empty.
 */
export function missingAssetsWarning(
  missing: readonly string[],
): string | null {
  if (missing.length === 0) return null;
  const noun = missing.length === 1 ? "asset" : "assets";
  return `assets: ${String(missing.length)} ${noun} missing or failed, using fallbacks (see public/assets/README.md): ${missing.join(", ")}`;
}

/** Loading progress from 0 to 1. Nothing to load counts as finished. */
export function progressRatio(loaded: number, total: number): number {
  if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0)
    return 1;
  return Math.min(1, Math.max(0, loaded / total));
}

/** Progress as a whole percentage for display, from 0 to 100. */
export function progressPercent(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.floor(Math.min(1, Math.max(0, ratio)) * 100);
}
