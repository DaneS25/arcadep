import { Group, MeshStandardMaterial, type Object3D } from "three";
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
  /** Solid parts that hide a spot behind them from picking (walls, roof, alley wall). */
  occluders: readonly Object3D[];
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
  const occluders: Object3D[] = [];
  floorBoxes().forEach((box, i) => {
    const floor = boxMesh(geometry, wall, box, `floor-${String(i)}`);
    occluders.push(floor);
    group.add(floor);
  });
  bandBoxes().forEach((box, i) => {
    group.add(boxMesh(geometry, trim, box, `band-${String(i)}`));
  });
  roofBoxes().forEach((box, i) => {
    const part = boxMesh(
      geometry,
      trim,
      box,
      i === 0 ? "roof" : `parapet-${String(i)}`,
    );
    occluders.push(part);
    group.add(part);
  });
  group.add(boxMesh(geometry, sidewalk, sidewalkBox(), "sidewalk"));
  const alleyWall = boxMesh(geometry, wall, alleyWallBox(), "alley-wall");
  occluders.push(alleyWall);
  group.add(alleyWall);

  const spots = createInteractionSpots();
  group.add(spots.object);

  return {
    object: group,
    spots,
    occluders,
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
