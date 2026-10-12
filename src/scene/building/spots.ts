import { Group, MeshStandardMaterial, type Mesh, type Object3D } from "three";
import {
  interactionSpots,
  sideAzimuthRad,
  type InteractionSpot,
} from "@/logic/buildingLayout";
import { PALETTE } from "@/logic/palette";
import { boxMesh, createUnitBox } from "./boxMesh";

export type SpotMarker = {
  readonly id: InteractionSpot["id"];
  readonly side: InteractionSpot["side"];
  readonly object: Object3D;
};

export type InteractionSpots = {
  object: Group;
  /** One marker per side, in visiting order. */
  markers: readonly SpotMarker[];
  /** Lights up one marker (hovered or focused), or none. */
  setHighlighted(id: SpotMarker["id"] | undefined): void;
  dispose(): void;
};

/**
 * A glowing placeholder box at each side's interaction spot (cabinet, neon signs,
 * graffiti wall, terminal). The side tasks (10 to 13) replace them with the real props.
 */
export function createInteractionSpots(): InteractionSpots {
  const geometry = createUnitBox();
  const material = new MeshStandardMaterial({
    color: PALETTE.base,
    emissive: PALETTE.accent,
    emissiveIntensity: 1,
  });
  // Brighter body as well as glow, so the highlight reads before bloom arrives (task 9).
  const lit = new MeshStandardMaterial({
    color: PALETTE.accent,
    emissive: PALETTE.accent,
    emissiveIntensity: 2,
  });
  const meshes = new Map<SpotMarker["id"], Mesh>();

  const group = new Group();
  group.name = "interaction-spots";
  const markers = interactionSpots().map((spot): SpotMarker => {
    // Sizes are in the side's own frame; turning the box to face out of its wall lines them up.
    const mesh = boxMesh(
      geometry,
      material,
      { centre: spot.position, size: spot.size },
      spot.id,
    );
    mesh.rotation.y = sideAzimuthRad(spot.side);
    mesh.userData = { spotId: spot.id, side: spot.side };
    group.add(mesh);
    meshes.set(spot.id, mesh);
    return { id: spot.id, side: spot.side, object: mesh };
  });

  return {
    object: group,
    markers,
    setHighlighted(id) {
      for (const [markerId, mesh] of meshes) {
        mesh.material = markerId === id ? lit : material;
      }
    },
    dispose() {
      group.clear();
      meshes.clear();
      geometry.dispose();
      material.dispose();
      lit.dispose();
    },
  };
}
