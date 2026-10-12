import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from "three";
import { NEON_INTENSITY } from "@/logic/lookConfig";
import { neonStrips } from "@/logic/neonLayout";
import { PALETTE } from "@/logic/palette";

export type NeonTubes = {
  object: InstancedMesh;
  dispose(): void;
};

/**
 * Every neon tube as one instanced unit cube: one draw call whatever the count. Colours
 * are pushed past 1 so the bloom pass picks them up; unlit, so they glow in the dark.
 */
export function createNeonTubes(): NeonTubes {
  const strips = neonStrips();
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial({ color: "#ffffff" });
  const mesh = new InstancedMesh(geometry, material, strips.length);
  mesh.name = "neon-tubes";

  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const rotation = new Quaternion();
  const color = new Color();
  strips.forEach((strip, i) => {
    position.set(strip.box.centre.x, strip.box.centre.y, strip.box.centre.z);
    scale.set(strip.box.size.x, strip.box.size.y, strip.box.size.z);
    mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
    mesh.setColorAt(
      i,
      color.set(PALETTE[strip.color]).multiplyScalar(NEON_INTENSITY),
    );
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();

  return {
    object: mesh,
    dispose() {
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
