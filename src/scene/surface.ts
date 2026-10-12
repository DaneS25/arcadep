import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  type Texture,
} from "three";
import type { TextureSet } from "@/logic/assetFallback";
import { boxesGeometryData } from "@/logic/boxGeometry";
import type { Box } from "@/logic/buildingLayout";
import {
  SURFACES,
  surfaceMaterialParams,
  type SurfaceId,
  type SurfaceMaterialParams,
} from "@/logic/lookConfig";
import type { TextureSlot } from "@/logic/assetManifest";

export type Surface = {
  readonly id: SurfaceId;
  readonly object: Mesh;
  /** Swaps in the surface's ambientCG maps, or keeps the plain colour if they're missing. */
  applyTextures(
    textures: Readonly<Record<TextureSlot, TextureSet<Texture>>>,
  ): void;
  dispose(): void;
};

/**
 * One merged mesh holding every box of a surface (all walls, all trim), so the whole
 * surface is one draw call with one material. Starts in its plain colour.
 */
export function createSurface(
  id: SurfaceId,
  boxes: readonly Box[],
  name: string,
): Surface {
  const look = SURFACES[id];
  const data = boxesGeometryData(boxes, look.tileM);
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(data.positions, 3),
  );
  geometry.setAttribute("normal", new Float32BufferAttribute(data.normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(data.uvs, 2));
  geometry.setIndex(data.indices);
  geometry.computeBoundingSphere();

  const material = new MeshStandardMaterial();
  const apply = (params: SurfaceMaterialParams<Texture>): void => {
    material.color.set(params.color);
    material.map = params.map;
    material.normalMap = params.normalMap;
    material.roughnessMap = params.roughnessMap;
    material.roughness = params.roughness;
    material.metalness = params.metalness;
    material.envMapIntensity = params.envMapIntensity;
    material.needsUpdate = true;
  };
  apply(
    surfaceMaterialParams<Texture>(look, {
      color: null,
      normal: null,
      roughness: null,
    }),
  );

  const mesh = new Mesh(geometry, material);
  mesh.name = name;

  return {
    id,
    object: mesh,
    applyTextures(textures) {
      apply(surfaceMaterialParams(look, textures[look.slot].maps));
    },
    dispose() {
      // Textures belong to the asset loader, which disposes them.
      geometry.dispose();
      material.dispose();
    },
  };
}
