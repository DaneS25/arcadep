import { Color, FogExp2, Scene, type Texture } from "three";
import type { TextureSet } from "@/logic/assetFallback";
import type { TextureSlot } from "@/logic/assetManifest";
import { ENVIRONMENT, FOG } from "@/logic/lookConfig";
import { PALETTE } from "@/logic/palette";
import { createLights } from "./atmosphere/lights";
import { createNeonTubes } from "./atmosphere/neon";
import { createBuilding, type Building } from "./building/building";
import type { SpotsContent } from "./building/spots";
import { createGround } from "./ground";

export type Stage = {
  scene: Scene;
  building: Building;
  /** Puts the loaded ambientCG maps on the street and building (plain colours stay for missing ones). */
  applyTextures(
    textures: Readonly<Record<TextureSlot, TextureSet<Texture>>>,
  ): void;
  /** Sets the baked neon environment that smooth surfaces reflect. */
  setEnvironment(texture: Texture | null): void;
  /** Moves animated props on by `dtMs`; under reduced motion nothing blinks. */
  update(dtMs: number, reducedMotion: boolean): void;
  /** Redraws canvas text (signs, screens) once the fonts have loaded. */
  redrawText(): void;
  dispose(): void;
};

/** The night street corner: fog, lights, the wet street, the building and its neon. */
export function createStage(content: SpotsContent): Stage {
  const scene = new Scene();
  scene.background = new Color(PALETTE.base);
  scene.fog = new FogExp2(FOG.color, FOG.density);
  scene.environmentIntensity = ENVIRONMENT.intensity;

  const lights = createLights();
  const ground = createGround();
  const building = createBuilding(content);
  const neon = createNeonTubes();
  scene.add(lights.object, ground.object, building.object, neon.object);

  return {
    scene,
    building,
    applyTextures(textures) {
      ground.applyTextures(textures);
      building.applyTextures(textures);
    },
    setEnvironment(texture) {
      scene.environment = texture;
    },
    update(dtMs, reducedMotion) {
      // The cabinet's attract screen; neon flicker is task 11, fog drift task 15.
      building.spots.update(dtMs, reducedMotion);
    },
    redrawText() {
      building.spots.redrawText();
    },
    dispose() {
      scene.clear();
      scene.environment = null;
      lights.dispose();
      ground.dispose();
      building.dispose();
      neon.dispose();
    },
  };
}
