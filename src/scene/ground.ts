import type { Mesh, Texture } from "three";
import type { TextureSet } from "@/logic/assetFallback";
import type { TextureSlot } from "@/logic/assetManifest";
import { createSurface } from "./surface";

/** Side length of the street plane in metres. */
export const GROUND_SIZE_M = 80;
const THICKNESS_M = 0.1;

export type Ground = {
  object: Mesh;
  applyTextures(
    textures: Readonly<Record<TextureSlot, TextureSet<Texture>>>,
  ): void;
  dispose(): void;
};

/** The wet street: a thin slab whose top is at y = 0, with world-sized texture tiles. */
export function createGround(): Ground {
  const surface = createSurface(
    "street",
    [
      {
        centre: { x: 0, y: -THICKNESS_M / 2, z: 0 },
        size: { x: GROUND_SIZE_M, y: THICKNESS_M, z: GROUND_SIZE_M },
      },
    ],
    "ground",
  );
  return {
    object: surface.object,
    applyTextures(textures) {
      surface.applyTextures(textures);
    },
    dispose() {
      surface.dispose();
    },
  };
}
