/**
 * The detail pass (task 14): AC units, pipes, cables, vents, puddles, the shop signs and
 * the rooftop name sign. Every piece merges into one mesh with one material (one draw
 * call): the metal texture through the first UV set, and one small atlas canvas through
 * the second, used as the emissive map, so only the sign faces glow. Each part's vertex
 * colour shades the metal (cables and puddles near black, sign faces black under their
 * glow). Pure numbers in metres; `scene/props/details.ts` builds the mesh and draws the
 * atlas.
 *
 * Split by part in task 39: types (`detailTypes`), the atlas (`detailAtlas`), sizes and
 * shared blocks (`detailParts`), plain props (`detailProps`), signs (`detailSigns`) and
 * the mesh data (`detailGeometry`). This file keeps the layout and re-exports the rest,
 * so importers don't change.
 */

import { BUILDING, pointOnSide } from "./buildingLayout";
import { DETAIL_SIZES, cable, roofTopY, wallBox } from "./detailParts";
import {
  PUDDLES,
  acUnit,
  drainPipe,
  pipeRun,
  puddle,
  roofAc,
  roofVent,
  vent,
} from "./detailProps";
import { hangingSign, rooftopSign } from "./detailSigns";
import type { DetailBeam, DetailBox, DetailLayout } from "./detailTypes";

export type {
  DetailBeam,
  DetailBox,
  DetailKind,
  DetailLayout,
  GlowColor,
  PatchFaceId,
  SignFace,
  SignId,
  WindowCellId,
  WindowGlass,
} from "./detailTypes";
export {
  DETAIL_TEXTURE,
  WINDOW_CELLS,
  centreUv,
  cornerUvs,
  detailUv,
  glowUvs,
} from "./detailAtlas";
export { DETAIL_SIZES, roofTopY, sagPoints, wallBox } from "./detailParts";
export { PUDDLES, vent } from "./detailProps";
export {
  HANGING_SIGNS,
  HANGING_SIGN_PARTS,
  hangingSignRect,
  type HangingSign,
  type HangingSignId,
} from "./detailSigns";
export {
  VERTICES_PER_BEAM,
  VERTICES_PER_BOX,
  detailGeometryData,
  faceVertexStarts,
  glassVertexStarts,
  signPlateVertices,
  withSignPlates,
  type DetailGeometryData,
  type DetailShades,
} from "./detailGeometry";

const D = DETAIL_SIZES;

/** Every detail prop round the building. */
export function detailLayout(): DetailLayout {
  const top = roofTopY();
  const halfW = BUILDING.widthM / 2;
  const cafe = hangingSign("cafe");
  const arcade = hangingSign("arcade");
  const roof = rooftopSign();

  const boxes: DetailBox[] = [
    // AC units on the upper floors, a couple on every side.
    ...acUnit("front", -4.2, 9.6),
    ...acUnit("front", 3.8, 10.4),
    ...acUnit("back", -1, 9.3),
    ...acUnit("back", 4, 10.6),
    ...acUnit("back", -3, 5.6),
    ...acUnit("right", 2.5, 9.9),
    ...acUnit("left", -3.2, 10.2),
    ...acUnit("left", 3, 9.4),
    // Rooftop plant.
    ...roofAc(-3.2, -2.2),
    ...roofAc(1.4, -2.8),
    ...roofVent(4.2, -3.5),
    ...roofVent(-4.6, 1),
    ...roofVent(3.2, 0.6),
    // Wall vents.
    ...vent("right", -3.5, 2.8),
    // Low on the first floor, under its right-hand window (task 27: the poster took its spot).
    ...vent("back", 0.9, 4.8),
    ...vent("front", -1.2, 7.4),
    // Between the two left-hand ground-floor windows (task 28: the generator took its spot).
    ...vent("left", -1.85, 2.6),
    // Drain pipes and a pipe run on the alley side.
    drainPipe("back", -halfW + 0.5),
    drainPipe("back", halfW - 0.5),
    drainPipe("right", -BUILDING.depthM / 2 + 0.4),
    drainPipe("left", -BUILDING.depthM / 2 + 0.4),
    pipeRun("back", -halfW + 0.5, -1, 11.4),
    {
      kind: "metal",
      box: wallBox(
        "back",
        -1,
        9.9,
        { across: D.pipeM, up: 11.4 - 9.9, out: D.pipeM },
        D.pipeGapM,
      ),
    },
    // Puddles on the pavement.
    ...PUDDLES.map((p) => puddle(p.x, p.z, p.sizeX, p.sizeZ)),
    // Signs.
    ...cafe.boxes,
    ...arcade.boxes,
    ...roof.boxes,
  ];

  const beams: DetailBeam[] = [
    // Sagging across the front's top floor.
    ...cable(
      pointOnSide("front", -halfW + 0.1, 11.9, 0.06),
      pointOnSide("front", halfW - 0.1, 11.9, 0.06),
      0.6,
    ),
    // From the right side's AC unit up to the roof. (The alley cables on the back wall and
    // the one between the left side's AC units went in task 29: from some orbits they crossed
    // the posters and the skill signs; the wires in `wireLayout` replace them.)
    ...cable(
      pointOnSide("right", 2.5, 10.5, 0.3),
      pointOnSide("right", 3.2, top - 0.1, 0.05),
      0.1,
    ),
    ...roof.beams,
  ];

  return {
    boxes,
    beams,
    faces: [cafe.face, arcade.face, ...roof.faces],
    glass: [],
  };
}
