import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  type Texture,
} from "three";
import type { TextureSet } from "@/logic/assetFallback";
import {
  boxesGeometryData,
  mergeGeometryData,
  type GeometryData,
} from "@/logic/boxGeometry";
import type { Box } from "@/logic/buildingLayout";
import {
  SURFACES,
  surfaceMaterialParams,
  type SurfaceId,
  type SurfaceMaterialParams,
} from "@/logic/lookConfig";
import type { TextureSlot } from "@/logic/assetManifest";
import { grimeUvs } from "@/logic/grimeLayout";
import { addGrime, type GrimeTextures } from "./grime";

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
 * surface is one draw call with one material. Starts in its plain colour. With `grime`
 * (the wall grime atlas, task 22), each face also reads its side's grime by where it is;
 * `grimeUvsOf` maps the vertices into another grime texture (the pavement's, task 24).
 * With `extra`, more vertex data joins the same mesh, marked 1 in a float attribute named
 * `extra.flag` (the boxes are 0), so the material's shader can draw it its own way (the
 * night sky in the ground's mesh, task 38) without another draw call.
 */
export function createSurface(
  id: SurfaceId,
  boxes: readonly Box[],
  name: string,
  grime?: GrimeTextures,
  grimeUvsOf: (data: GeometryData) => number[] = grimeUvs,
  extra?: { readonly data: GeometryData; readonly flag: string },
): Surface {
  const look = SURFACES[id];
  const boxData = boxesGeometryData(boxes, look.tileM);
  const data =
    extra === undefined ? boxData : mergeGeometryData(boxData, extra.data);
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(data.positions, 3),
  );
  geometry.setAttribute("normal", new Float32BufferAttribute(data.normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(data.uvs, 2));
  geometry.setIndex(data.indices);
  if (extra !== undefined) {
    const boxVertices = boxData.positions.length / 3;
    const flags = Array.from({ length: data.positions.length / 3 }, (_, i) =>
      i < boxVertices ? 0 : 1,
    );
    geometry.setAttribute(extra.flag, new Float32BufferAttribute(flags, 1));
  }
  geometry.computeBoundingSphere();

  const material = new MeshStandardMaterial();
  if (grime !== undefined) {
    geometry.setAttribute(
      "grimeUv",
      new Float32BufferAttribute(grimeUvsOf(data), 2),
    );
    addGrime(material, { grime, source: { kind: "attribute" } });
  }
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
