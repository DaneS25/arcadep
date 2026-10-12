import { Group, type Object3D, type Texture } from "three";
import type { TextureSet } from "@/logic/assetFallback";
import type { TextureSlot } from "@/logic/assetManifest";
import {
  alleyWallBox,
  bandBoxes,
  floorBoxes,
  roofBoxes,
  sidewalkBox,
} from "@/logic/buildingLayout";
import { createSurface } from "../surface";
import { createInteractionSpots, type InteractionSpots } from "./spots";

export type Building = {
  object: Group;
  /** Each side's interaction marker, for picking in task 7. */
  spots: InteractionSpots;
  /** Solid parts that hide a spot behind them from picking (walls, trim and roof, alley wall). */
  occluders: readonly Object3D[];
  applyTextures(
    textures: Readonly<Record<TextureSlot, TextureSet<Texture>>>,
  ): void;
  dispose(): void;
};

/**
 * The building on its street corner: three floors and the alley wall (one merged wall
 * surface), floor bands, roof and parapets (one merged trim surface), the pavement and
 * each side's interaction marker. Three draw calls plus the markers.
 */
export function createBuilding(): Building {
  const walls = createSurface(
    "wall",
    [...floorBoxes(), alleyWallBox()],
    "walls",
  );
  const trim = createSurface("trim", [...bandBoxes(), ...roofBoxes()], "trim");
  const sidewalk = createSurface("sidewalk", [sidewalkBox()], "sidewalk");
  const surfaces = [walls, trim, sidewalk];

  const group = new Group();
  group.name = "building";
  for (const surface of surfaces) group.add(surface.object);

  const spots = createInteractionSpots();
  group.add(spots.object);

  return {
    object: group,
    spots,
    occluders: [walls.object, trim.object],
    applyTextures(textures) {
      for (const surface of surfaces) surface.applyTextures(textures);
    },
    dispose() {
      group.clear();
      spots.dispose();
      for (const surface of surfaces) surface.dispose();
    },
  };
}
