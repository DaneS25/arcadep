import { Group, type Object3D } from "three";
import {
  interactionSpots,
  type InteractionSpot,
  type Vec3,
} from "@/logic/buildingLayout";
import { createCabinet, type AttractInfo } from "../sides/cabinet";
import { createDoorTerminal } from "../sides/doorTerminal";
import {
  createGraffitiWall,
  type PosterProject,
  type Thumbnails,
} from "../sides/graffitiWall";
import { createNeonSigns, type SignSkill } from "../sides/neonSigns";

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
  /** The project whose poster is at a world point on the graffiti wall, if any. */
  posterAt(point: Vec3): number | undefined;
  /** Puts the loaded project thumbnails on the graffiti wall's posters. */
  setThumbnails(thumbnails: Thumbnails): void;
  /** Runs the props' own animation (the cabinet's attract screen, the signs' flicker). */
  update(dtMs: number, reducedMotion: boolean): void;
  /** Redraws canvas text, once the fonts have loaded. */
  redrawText(): void;
  dispose(): void;
};

export type SpotsContent = {
  /** Shown on the cabinet's attract screen. */
  attract: AttractInfo;
  /** One neon sign each on the left side. */
  skills: readonly SignSkill[];
  /** One paste-up poster each on the back side. */
  projects: readonly PosterProject[];
};

/**
 * Each side's interactive prop at its spot: the arcade cabinet on the front (task 10), the
 * neon skill signs on the left (task 11), the graffiti wall on the back (task 12) and the
 * door terminal on the right (task 13). Every prop keeps its spot's id for picking.
 */
export function createInteractionSpots(
  content: SpotsContent,
): InteractionSpots {
  const cabinet = createCabinet(content.attract);
  const signs = createNeonSigns(content.skills);
  const graffiti = createGraffitiWall(content.projects);
  const terminal = createDoorTerminal();

  const group = new Group();
  group.name = "interaction-spots";
  const markers = interactionSpots().map((spot): SpotMarker => {
    if (spot.side === "front") {
      group.add(cabinet.object);
      return { id: spot.id, side: spot.side, object: cabinet.object };
    }
    if (spot.side === "left") {
      group.add(signs.object);
      return { id: spot.id, side: spot.side, object: signs.object };
    }
    if (spot.side === "back") {
      group.add(graffiti.object);
      // Only the posters are picked; the graffiti round them is decoration.
      return { id: spot.id, side: spot.side, object: graffiti.pickObject };
    }
    group.add(terminal.object);
    return { id: spot.id, side: spot.side, object: terminal.object };
  });

  return {
    object: group,
    markers,
    setHighlighted(id) {
      cabinet.setHighlighted(id === "spot-front");
      signs.setHighlighted(id === "spot-left");
      graffiti.setHighlighted(id === "spot-back");
      terminal.setHighlighted(id === "spot-right");
    },
    posterAt(point) {
      return graffiti.posterAt(point);
    },
    setThumbnails(thumbnails) {
      graffiti.setThumbnails(thumbnails);
    },
    update(dtMs, reducedMotion) {
      cabinet.update(dtMs, reducedMotion);
      signs.update(dtMs, reducedMotion);
    },
    redrawText() {
      cabinet.redraw();
      signs.redraw();
      graffiti.redraw();
      terminal.redraw();
    },
    dispose() {
      group.clear();
      cabinet.dispose();
      signs.dispose();
      graffiti.dispose();
      terminal.dispose();
    },
  };
}
