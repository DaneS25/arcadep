import { Color, DirectionalLight, HemisphereLight, Scene } from "three";
import { PALETTE } from "@/logic/palette";
import { createBuilding, type Building } from "./building/building";
import { createGround } from "./ground";

export type Stage = {
  scene: Scene;
  building: Building;
  update(dtMs: number): void;
  dispose(): void;
};

/** The dark street corner: background colour, dim fill and moon lights, the ground plane and the building. */
export function createStage(): Stage {
  const scene = new Scene();
  scene.background = new Color(PALETTE.base);

  const fill = new HemisphereLight("#3a3a55", PALETTE.base, 0.6);
  scene.add(fill);

  // Dim cold moonlight from above the front-left, so the blockout's faces read apart.
  const moon = new DirectionalLight("#8890c0", 0.8);
  moon.position.set(-10, 20, 14);
  scene.add(moon);

  const ground = createGround();
  scene.add(ground.object);

  const building = createBuilding();
  scene.add(building.object);

  return {
    scene,
    building,
    update() {
      // Nothing animates yet; ambient motion hooks in here from the look pass on.
    },
    dispose() {
      scene.remove(building.object, ground.object, moon, fill);
      building.dispose();
      ground.dispose();
      moon.dispose();
      fill.dispose();
    },
  };
}
