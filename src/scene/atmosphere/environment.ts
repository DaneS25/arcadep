import {
  BackSide,
  BoxGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  type Texture,
  type WebGLRenderer,
} from "three";
import { ENVIRONMENT, ENVIRONMENT_PANELS } from "@/logic/lookConfig";
import { PALETTE } from "@/logic/palette";

export type Environment = {
  /** Pre-filtered environment map for `scene.environment`. */
  texture: Texture;
  dispose(): void;
};

/**
 * Bakes a dark room with glowing neon panels into an environment map, once at start-up.
 * Smooth surfaces (the wet street) reflect it, so there's no extra render pass per frame.
 */
export function createEnvironment(renderer: WebGLRenderer): Environment {
  const room = new Scene();
  const roomGeometry = new BoxGeometry(1, 1, 1);
  const roomMaterial = new MeshBasicMaterial({
    color: ENVIRONMENT.roomColor,
    side: BackSide,
  });
  const roomMesh = new Mesh(roomGeometry, roomMaterial);
  roomMesh.scale.setScalar(ENVIRONMENT.roomSizeM);
  room.add(roomMesh);

  const panelGeometry = new PlaneGeometry(1, 1);
  const panelMaterials = ENVIRONMENT_PANELS.map((panel) => {
    const material = new MeshBasicMaterial({
      color: new Color(PALETTE[panel.color]).multiplyScalar(panel.intensity),
    });
    const mesh = new Mesh(panelGeometry, material);
    mesh.position.set(panel.position.x, panel.position.y, panel.position.z);
    mesh.rotation.y = panel.rotationYRad;
    mesh.scale.set(panel.size.width, panel.size.height, 1);
    room.add(mesh);
    return material;
  });

  const generator = new PMREMGenerator(renderer);
  const target = generator.fromScene(room, 0.04);
  generator.dispose();
  room.clear();
  roomGeometry.dispose();
  roomMaterial.dispose();
  panelGeometry.dispose();
  for (const material of panelMaterials) material.dispose();

  return {
    texture: target.texture,
    dispose() {
      target.dispose();
    },
  };
}
