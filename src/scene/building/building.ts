import { Group, MeshStandardMaterial } from "three";
import {
  alleyWallBox,
  bandBoxes,
  floorBoxes,
  roofBoxes,
  sidewalkBox,
} from "@/logic/buildingLayout";
import { PALETTE } from "@/logic/palette";
import { boxMesh, createUnitBox } from "./boxMesh";
import { createInteractionSpots, type InteractionSpots } from "./spots";

export type Building = {
  object: Group;
  /** Each side's interaction marker, for picking in task 7. */
  spots: InteractionSpots;
  dispose(): void;
};

/**
 * Blockout of the building on its street corner: three floors with trim bands, the roof
 * and parapets, the pavement, the wall across the back alley and each side's interaction
 * marker. Plain colours; the look pass (task 9) adds textures and neon.
 */
export function createBuilding(): Building {
  const geometry = createUnitBox();
  const wall = new MeshStandardMaterial({
    color: PALETTE.wall,
    roughness: 0.95,
  });
  const trim = new MeshStandardMaterial({
    color: PALETTE.trim,
    roughness: 0.8,
  });
  const sidewalk = new MeshStandardMaterial({
    color: PALETTE.sidewalk,
    roughness: 0.9,
  });

  const group = new Group();
  group.name = "building";
  floorBoxes().forEach((box, i) => {
    group.add(boxMesh(geometry, wall, box, `floor-${String(i)}`));
  });
  bandBoxes().forEach((box, i) => {
    group.add(boxMesh(geometry, trim, box, `band-${String(i)}`));
  });
  roofBoxes().forEach((box, i) => {
    group.add(
      boxMesh(geometry, trim, box, i === 0 ? "roof" : `parapet-${String(i)}`),
    );
  });
  group.add(boxMesh(geometry, sidewalk, sidewalkBox(), "sidewalk"));
  group.add(boxMesh(geometry, wall, alleyWallBox(), "alley-wall"));

  const spots = createInteractionSpots();
  group.add(spots.object);

  return {
    object: group,
    spots,
    dispose() {
      group.clear();
      spots.dispose();
      geometry.dispose();
      wall.dispose();
      trim.dispose();
      sidewalk.dispose();
    },
  };
}
