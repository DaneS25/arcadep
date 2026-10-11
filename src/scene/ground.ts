import { Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import { PALETTE } from "@/logic/palette";

/** Side length of the street plane in metres. */
export const GROUND_SIZE_M = 80;

export type Ground = {
  object: Mesh;
  dispose(): void;
};

/** A flat, rough street plane at y = 0. Textures replace the plain colour in the look pass. */
export function createGround(): Ground {
  const geometry = new PlaneGeometry(GROUND_SIZE_M, GROUND_SIZE_M);
  const material = new MeshStandardMaterial({
    color: PALETTE.ground,
    roughness: 0.9,
    metalness: 0,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = "ground";
  mesh.rotation.x = -Math.PI / 2;

  return {
    object: mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
