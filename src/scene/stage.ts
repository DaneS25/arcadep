import { Color, FogExp2, Scene, type Camera, type Texture } from "three";
import type { TextureSet } from "@/logic/assetFallback";
import type { TextureSlot } from "@/logic/assetManifest";
import { ENVIRONMENT, FOG } from "@/logic/lookConfig";
import { PALETTE } from "@/logic/palette";
import { skillSignsLayout } from "@/logic/skillSignsLayout";
import { createFogWisps } from "./atmosphere/fogWisps";
import { createLights } from "./atmosphere/lights";
import { createNeonTubes } from "./atmosphere/neon";
import { createBuilding, type Building } from "./building/building";
import type { SpotMarker, SpotsContent } from "./building/spots";
import { createGround } from "./ground";
import { createDetails, type SignTexts } from "./props/details";

/** What the stage shows: each side's content, plus the words on the building's signs. */
export type StageContent = SpotsContent & { readonly signs: SignTexts };

export type Stage = {
  scene: Scene;
  building: Building;
  /** Puts the loaded ambientCG maps on the street and building (plain colours stay for missing ones). */
  applyTextures(
    textures: Readonly<Record<TextureSlot, TextureSet<Texture>>>,
  ): void;
  /** Sets the baked neon environment that smooth surfaces reflect. */
  setEnvironment(texture: Texture | null): void;
  /** Lights up one side's prop (hovered or focused), or none. */
  setHighlighted(id: SpotMarker["id"] | undefined): void;
  /**
   * Moves animated props and the fog wisps on by `dtMs` (nothing blinks and the wisps hold
   * still under reduced motion), and turns the wisps to face `camera`.
   */
  update(dtMs: number, reducedMotion: boolean, camera: Camera): void;
  /** Redraws canvas text (signs, screens) once the fonts have loaded. */
  redrawText(): void;
  dispose(): void;
};

/**
 * The night street corner: fog and drifting wisps (task 15), lights, the wet street, the
 * building, its neon and its detail props (task 14).
 */
export function createStage(content: StageContent): Stage {
  const scene = new Scene();
  scene.background = new Color(PALETTE.base);
  scene.fog = new FogExp2(FOG.color, FOG.density);
  scene.environmentIntensity = ENVIRONMENT.intensity;

  const lights = createLights();
  const ground = createGround();
  const building = createBuilding(content);
  const neon = createNeonTubes();
  // The skill signs' plates are drawn by the details mesh, which saves a draw call.
  const signPlates = skillSignsLayout(content.skills.length).signs.map(
    (sign) => sign.plate,
  );
  const details = createDetails(content.signs, signPlates);
  const wisps = createFogWisps();
  scene.add(
    lights.object,
    ground.object,
    building.object,
    neon.object,
    details.object,
    wisps.object,
  );

  return {
    scene,
    building,
    applyTextures(textures) {
      ground.applyTextures(textures);
      building.applyTextures(textures);
      details.applyTextures(textures);
    },
    setEnvironment(texture) {
      scene.environment = texture;
    },
    setHighlighted(id) {
      building.spots.setHighlighted(id);
      details.setSignPlatesLit(id === "spot-left");
    },
    update(dtMs, reducedMotion, camera) {
      // The cabinet's attract screen, the signs' flicker and the fog's drift.
      building.spots.update(dtMs, reducedMotion);
      wisps.update(dtMs, reducedMotion, camera);
    },
    redrawText() {
      building.spots.redrawText();
      details.redraw();
    },
    dispose() {
      scene.clear();
      scene.environment = null;
      lights.dispose();
      ground.dispose();
      building.dispose();
      neon.dispose();
      details.dispose();
      wisps.dispose();
    },
  };
}
