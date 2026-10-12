import { Group, MeshStandardMaterial, type Mesh, type Object3D } from "three";
import {
  interactionSpots,
  sideAzimuthRad,
  type InteractionSpot,
} from "@/logic/buildingLayout";
import { PALETTE } from "@/logic/palette";
import { createCabinet, type AttractInfo } from "../sides/cabinet";
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
  /** Runs the props' own animation (the cabinet's attract screen). */
  update(dtMs: number, reducedMotion: boolean): void;
  /** Redraws canvas text, once the fonts have loaded. */
  redrawText(): void;
  dispose(): void;
};

export type SpotsContent = {
  /** Shown on the cabinet's attract screen. */
  attract: AttractInfo;
};

/**
 * Each side's interactive prop at its spot: the arcade cabinet on the front (task 10), and
 * a glowing placeholder box on the sides still to come (tasks 11 to 13). Every prop keeps
 * its spot's id for picking.
 */
export function createInteractionSpots(
  content: SpotsContent,
): InteractionSpots {
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
  const boxes = new Map<SpotMarker["id"], Mesh>();
  const cabinet = createCabinet(content.attract);

  const group = new Group();
  group.name = "interaction-spots";
  const markers = interactionSpots().map((spot): SpotMarker => {
    if (spot.side === "front") {
      group.add(cabinet.object);
      return { id: spot.id, side: spot.side, object: cabinet.object };
    }
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
    boxes.set(spot.id, mesh);
    return { id: spot.id, side: spot.side, object: mesh };
  });

  return {
    object: group,
    markers,
    setHighlighted(id) {
      for (const [markerId, mesh] of boxes) {
        mesh.material = markerId === id ? lit : material;
      }
      cabinet.setHighlighted(id === "spot-front");
    },
    update(dtMs, reducedMotion) {
      cabinet.update(dtMs, reducedMotion);
    },
    redrawText() {
      cabinet.redraw();
    },
    dispose() {
      group.clear();
      boxes.clear();
      cabinet.dispose();
      geometry.dispose();
      material.dispose();
      lit.dispose();
    },
  };
}
