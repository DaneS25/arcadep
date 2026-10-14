import { Group, type Object3D, type Texture } from "three";
import type { TextureSet } from "@/logic/assetFallback";
import type { TextureSlot } from "@/logic/assetManifest";
import {
  bandBoxes,
  floorBoxes,
  kerbBoxes,
  roofBoxes,
  sidewalkBox,
} from "@/logic/buildingLayout";
import { sidewalkGrimeUvs } from "@/logic/sidewalkLayout";
import { createSidewalkGrime, createWallGrime } from "../grime";
import { createSurface } from "../surface";
import {
  createInteractionSpots,
  type InteractionSpots,
  type SpotsContent,
} from "./spots";

export type Building = {
  object: Group;
  /** Each side's interaction marker, for picking in task 7. */
  spots: InteractionSpots;
  /** Solid parts that hide a spot behind them from picking (walls, trim and roof). */
  occluders: readonly Object3D[];
  applyTextures(
    textures: Readonly<Record<TextureSlot, TextureSet<Texture>>>,
  ): void;
  dispose(): void;
};

/**
 * The building on its street corner: three floors (one merged wall surface), floor bands,
 * roof and parapets (one merged trim surface), the pavement with its kerb stones all the
 * way round (task 24) and each side's interactive prop. Three draw calls plus the props.
 * The walls and trim share one generated grime atlas (task 22): streaks, stains, cracks,
 * chips and rust runs; the pavement has its own, seen from above (cracks, joints, stains).
 */
export function createBuilding(content: SpotsContent): Building {
  const grime = createWallGrime();
  const pavementGrime = createSidewalkGrime();
  const walls = createSurface("wall", floorBoxes(), "walls", grime);
  const trim = createSurface(
    "trim",
    [...bandBoxes(), ...roofBoxes()],
    "trim",
    grime,
  );
  const sidewalk = createSurface(
    "sidewalk",
    [sidewalkBox(), ...kerbBoxes()],
    "sidewalk",
    pavementGrime,
    sidewalkGrimeUvs,
  );
  const surfaces = [walls, trim, sidewalk];

  const group = new Group();
  group.name = "building";
  for (const surface of surfaces) group.add(surface.object);

  const spots = createInteractionSpots(content);
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
      grime.dispose();
      pavementGrime.dispose();
    },
  };
}
