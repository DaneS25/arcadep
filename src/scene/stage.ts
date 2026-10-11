import { Color, HemisphereLight, Scene } from "three";
import { PALETTE } from "@/logic/palette";
import { createGround } from "./ground";

export type Stage = {
  scene: Scene;
  update(dtMs: number): void;
  dispose(): void;
};

/** The empty dark street: background colour, a dim fill light and the ground plane. */
export function createStage(): Stage {
  const scene = new Scene();
  scene.background = new Color(PALETTE.base);

  const fill = new HemisphereLight("#3a3a55", PALETTE.base, 0.6);
  scene.add(fill);

  const ground = createGround();
  scene.add(ground.object);

  return {
    scene,
    update() {
      // Nothing animates yet; scene modules hook in here from task 5 on.
    },
    dispose() {
      scene.remove(ground.object, fill);
      ground.dispose();
      fill.dispose();
    },
  };
}
