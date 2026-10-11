import { BoxGeometry, Mesh, type Material } from "three";
import type { Box } from "@/logic/buildingLayout";

/** A 1 m cube shared by every blockout box; each mesh scales it to its own size. */
export function createUnitBox(): BoxGeometry {
  return new BoxGeometry(1, 1, 1);
}

/** A mesh of the shared unit cube placed and scaled to fill `box`. */
export function boxMesh(
  geometry: BoxGeometry,
  material: Material,
  box: Box,
  name: string,
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(box.centre.x, box.centre.y, box.centre.z);
  mesh.scale.set(box.size.x, box.size.y, box.size.z);
  return mesh;
}
