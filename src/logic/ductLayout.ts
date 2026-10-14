/**
 * Ducts, flues and the back door lamp (task 23): rectangular ducts climbing the right and
 * back walls to cowls over the parapet, a roof duct to an exhaust stack, a boiler flue and
 * extractor stubs, a few more louvred vents, a drain grate in the alley, and a dim caged
 * lamp over the back door under the fire escape. All of it joins the details mesh
 * (`withDucts`), so it costs no draw call; the lamp's bulb glows through the atlas's lamp
 * patch. `steamVents` lists where steam comes out (drawn by the fog wisps' instanced mesh,
 * `logic/steam.ts`). Pure numbers in metres.
 */

import {
  pointOnSide,
  sideNormal,
  type Box,
  type Side,
  type Vec3,
} from "./buildingLayout";
import {
  roofTopY,
  vent,
  wallBox,
  type DetailBeam,
  type DetailBox,
  type DetailLayout,
} from "./detailLayout";

/** A rectangular duct's section, and how far it stands off the wall (past the bands). */
export const DUCT = {
  /** Across the wall (risers) or up (runs along it). */
  widthM: 0.4,
  /** Out from the wall. */
  depthM: 0.3,
  gapM: 0.2,
  /** Joint flanges: this much bigger all round, this long. */
  flangeM: 0.03,
  flangeLengthM: 0.05,
  /** Joints every this far. */
  jointStepM: 1.4,
  /** A riser's top over the parapet, and the cowl turned out over it. */
  topY: 14.2,
  cowl: { upM: 0.32, outM: 0.6 },
} as const;

/** Small round pipes (flue, extractor stubs), drawn square like the drain pipes. */
export const STUB_M = 0.12;

/**
 * The dim caged lamp over the back door under the fire escape (task 20 review): a wall
 * plate, an arm, a shade, the bulb and a cage of four bars round it.
 */
export const BACK_LAMP = {
  side: "back",
  /** Over the right-hand back door (seen from the alley), under the fire escape. */
  alongM: 4.75,
  /** Bottom of the cage, just over the door frame's top (2.3 m). */
  bottomY: 2.42,
  /** The bulb's centre out from the wall. */
  outM: 0.28,
  bulbM: 0.08,
  cageM: 0.17,
  cageUpM: 0.16,
  barM: 0.014,
} as const satisfies { side: Side } & Record<string, unknown>;

/** The lamp bulb's centre, where its light sits. */
export function backLampPosition(): Vec3 {
  const L = BACK_LAMP;
  return pointOnSide(L.side, L.alongM, L.bottomY + L.cageUpM / 2, L.outM);
}

/** Where steam comes out, and which way it leaves. */
export type SteamVent = {
  readonly id: string;
  readonly position: Vec3;
  /** Unit vector: out of the wall or straight up. */
  readonly direction: Vec3;
  /** How thick its steam is, 0 to 1. */
  readonly strength: number;
  /** A puff's width as it leaves the vent. */
  readonly sizeM: number;
};

const UP: Vec3 = { x: 0, y: 1, z: 0 };

/** The ducts' fixed places, chosen round the windows, signs, neon and props on each wall. */
export const DUCT_RUNS = {
  /** Right: a run along the first floor from an elbow in the wall to a riser. */
  right: { riserAlongM: -2.75, elbowAlongM: -4.2, bottomY: 6.6 },
  /** Back: a riser from a boot in the wall above the floor band. */
  back: { riserAlongM: -0.15, bottomY: 4.75 },
  /** Roof: from the west roof AC unit to an exhaust stack. */
  roof: { stack: { x: -1, z: -2 }, stackUpM: 1.6, ductFromX: -2.4, ductY: 0.4 },
  /** Front: a boiler flue on the top floor; right: an extractor stub. */
  flue: { side: "front", alongM: -1.25, y: 10.2 },
  stub: { side: "right", alongM: -0.5, y: 10.6 },
  /** Back: a dryer stub over the poster row, near the lamp. */
  backStub: { side: "back", alongM: 3.4, y: 3.74 },
  /** The drain grate on the alley floor in front of the lit door. */
  grate: { alongM: 3.9, outM: 2 },
} as const;

/** Joint flanges along a duct from `from` to `to` (along or up, whichever `at` maps). */
function joints(fromM: number, toM: number): number[] {
  const out: number[] = [];
  for (let m = fromM + DUCT.jointStepM; m < toM - 0.3; m += DUCT.jointStepM)
    out.push(m);
  return out;
}

/** A vertical duct on a wall from `bottomY` to `DUCT.topY`, with its joints and cowl. */
function riser(side: Side, alongM: number, bottomY: number): DetailBox[] {
  const D = DUCT;
  const boxes: DetailBox[] = [
    {
      kind: "metal",
      box: wallBox(
        side,
        alongM,
        bottomY,
        { across: D.widthM, up: D.topY - bottomY, out: D.depthM },
        D.gapM,
      ),
    },
    // The cowl, turned out from the wall over the parapet.
    {
      kind: "metal",
      box: wallBox(
        side,
        alongM,
        D.topY,
        { across: D.widthM + 0.06, up: D.cowl.upM, out: D.cowl.outM },
        D.gapM - 0.03,
      ),
    },
  ];
  for (const y of joints(bottomY, D.topY))
    boxes.push({
      kind: "plate",
      box: wallBox(
        side,
        alongM,
        y,
        {
          across: D.widthM + 2 * D.flangeM,
          up: D.flangeLengthM,
          out: D.depthM + 2 * D.flangeM,
        },
        D.gapM - D.flangeM,
      ),
    });
  // Straps back to the wall, clear of the floor bands' overhang.
  for (const y of joints(bottomY - 0.7, D.topY - 1.2))
    boxes.push({
      kind: "metal",
      box: wallBox(
        side,
        alongM,
        y + 0.4,
        { across: 0.1, up: 0.05, out: D.gapM },
        0,
      ),
    });
  return boxes;
}

/** The right wall's duct: an elbow out of the wall, a run along it, then the riser. */
function rightDuct(): DetailBox[] {
  const R = DUCT_RUNS.right;
  const D = DUCT;
  const side: Side = "right";
  const runFrom = R.elbowAlongM + D.widthM;
  const runTo = R.riserAlongM - D.widthM / 2;
  const boxes: DetailBox[] = [
    // Elbow: from the wall out to the run's front.
    {
      kind: "metal",
      box: wallBox(
        side,
        R.elbowAlongM + D.widthM / 2,
        R.bottomY,
        { across: D.widthM, up: D.widthM, out: D.gapM + D.depthM },
        0,
      ),
    },
    {
      kind: "metal",
      box: wallBox(
        side,
        (runFrom + runTo) / 2,
        R.bottomY,
        { across: runTo - runFrom, up: D.widthM, out: D.depthM },
        D.gapM,
      ),
    },
    // A joint halfway along the run.
    {
      kind: "plate",
      box: wallBox(
        side,
        (runFrom + runTo) / 2,
        R.bottomY - D.flangeM,
        {
          across: D.flangeLengthM,
          up: D.widthM + 2 * D.flangeM,
          out: D.depthM + 2 * D.flangeM,
        },
        D.gapM - D.flangeM,
      ),
    },
    ...riser(side, R.riserAlongM, R.bottomY),
  ];
  return boxes;
}

/** The back wall's riser, out of a boot in the wall just over the floor band. */
function backDuct(): DetailBox[] {
  const B = DUCT_RUNS.back;
  return [
    {
      kind: "metal",
      box: wallBox(
        "back",
        B.riserAlongM,
        B.bottomY,
        { across: DUCT.widthM, up: DUCT.widthM, out: DUCT.gapM },
        0,
      ),
    },
    ...riser("back", B.riserAlongM, B.bottomY),
  ];
}

/** A box standing on the roof slab, by its centre on the ground plane. */
function onRoof(x: number, z: number, bottomY: number, size: Vec3): Box {
  return { centre: { x, y: bottomY + size.y / 2, z }, size };
}

/** The roof duct from the west AC unit to a tall exhaust stack with a cap. */
function roofExhaust(): DetailBox[] {
  const R = DUCT_RUNS.roof;
  const top = roofTopY();
  const stackM = 0.3;
  const ductTo = R.stack.x - stackM / 2;
  return [
    {
      kind: "metal",
      box: onRoof(R.stack.x, R.stack.z, top, {
        x: stackM,
        y: R.stackUpM,
        z: stackM,
      }),
    },
    {
      kind: "plate",
      box: onRoof(R.stack.x, R.stack.z, top + R.stackUpM + 0.08, {
        x: 0.5,
        y: 0.05,
        z: 0.5,
      }),
    },
    {
      kind: "metal",
      box: onRoof((R.ductFromX + ductTo) / 2, R.stack.z, top + R.ductY, {
        x: ductTo - R.ductFromX,
        y: 0.28,
        z: 0.28,
      }),
    },
    // A trestle under the duct's middle.
    {
      kind: "metal",
      box: onRoof((R.ductFromX + ductTo) / 2, R.stack.z, top, {
        x: 0.06,
        y: R.ductY,
        z: 0.4,
      }),
    },
  ];
}

/** A small pipe stub out of a wall at height `y` (its centre), turned up at the end. */
function flue(side: Side, alongM: number, y: number): DetailBox[] {
  const outM = 0.45;
  return [
    // Wall plate.
    {
      kind: "plate",
      box: wallBox(
        side,
        alongM,
        y - 0.12,
        { across: 0.24, up: 0.24, out: 0.02 },
        0,
      ),
    },
    {
      kind: "metal",
      box: wallBox(
        side,
        alongM,
        y - STUB_M / 2,
        { across: STUB_M, up: STUB_M, out: outM - STUB_M },
        0.02,
      ),
    },
    {
      kind: "metal",
      box: wallBox(
        side,
        alongM,
        y - STUB_M / 2,
        { across: STUB_M, up: 0.7, out: STUB_M },
        outM - STUB_M + 0.02,
      ),
    },
    // Rain cap, held a little over the pipe's mouth.
    {
      kind: "plate",
      box: wallBox(
        side,
        alongM,
        y - STUB_M / 2 + 0.78,
        { across: 0.26, up: 0.04, out: 0.26 },
        outM - STUB_M / 2 + 0.02 - 0.13,
      ),
    },
  ];
}

/** A short stub straight out of a wall, with a hood over its mouth. */
function stub(side: Side, alongM: number, y: number): DetailBox[] {
  return [
    {
      kind: "metal",
      box: wallBox(
        side,
        alongM,
        y - STUB_M / 2,
        { across: STUB_M + 0.03, up: STUB_M, out: 0.32 },
        0,
      ),
    },
    {
      kind: "plate",
      box: wallBox(
        side,
        alongM,
        y + STUB_M / 2,
        { across: 0.22, up: 0.03, out: 0.12 },
        0.26,
      ),
    },
  ];
}

/** The caged lamp's parts; the bulb is a `lamp` box, glowing through the atlas. */
export function backLampParts(): DetailBox[] {
  const L = BACK_LAMP;
  const half = L.cageM / 2;
  const shadeY = L.bottomY + L.cageUpM;
  const parts: DetailBox[] = [
    // Wall plate, standing proud of the back wall's paint.
    {
      kind: "metal",
      box: wallBox(
        L.side,
        L.alongM,
        L.bottomY + 0.02,
        { across: 0.16, up: 0.26, out: 0.08 },
        0,
      ),
    },
    // Arm out to the shade.
    {
      kind: "metal",
      box: wallBox(
        L.side,
        L.alongM,
        shadeY + 0.04,
        { across: 0.04, up: 0.04, out: L.outM - 0.08 },
        0.08,
      ),
    },
    // Shade over the bulb.
    {
      kind: "plate",
      box: wallBox(
        L.side,
        L.alongM,
        shadeY,
        { across: L.cageM + 0.04, up: 0.04, out: L.cageM + 0.04 },
        L.outM - half - 0.02,
      ),
    },
    // The bulb.
    {
      kind: "lamp",
      box: wallBox(
        L.side,
        L.alongM,
        L.bottomY + (L.cageUpM - L.bulbM) / 2,
        { across: L.bulbM, up: L.bulbM, out: L.bulbM },
        L.outM - L.bulbM / 2,
      ),
    },
    // The cage's bottom ring.
    {
      kind: "metal",
      box: wallBox(
        L.side,
        L.alongM,
        L.bottomY,
        { across: L.cageM, up: L.barM, out: L.cageM },
        L.outM - half,
      ),
    },
  ];
  // Four bars at the cage's corners, from the ring up to the shade.
  for (const sa of [-1, 1])
    for (const so of [-1, 1])
      parts.push({
        kind: "metal",
        box: wallBox(
          L.side,
          L.alongM + sa * (half - L.barM / 2),
          L.bottomY + L.barM,
          { across: L.barM, up: L.cageUpM - L.barM, out: L.barM },
          L.outM + so * (half - L.barM / 2) - L.barM / 2,
        ),
      });
  return parts;
}

/** The drain grate on the alley floor: a frame and three bars, a few mm thick. */
function grate(): DetailBox[] {
  const G = DUCT_RUNS.grate;
  const centre = pointOnSide("back", G.alongM, 0, G.outM);
  const n = sideNormal("back");
  const along = 0.8;
  const out = 0.5;
  const size = (a: number, o: number, y: number): Vec3 => ({
    x: Math.abs(n.z) * a + Math.abs(n.x) * o,
    y,
    z: Math.abs(n.x) * a + Math.abs(n.z) * o,
  });
  return [
    {
      kind: "cable",
      box: {
        centre: { x: centre.x, y: 0.004, z: centre.z },
        size: size(along, out, 0.004),
      },
    },
    ...[-0.15, 0, 0.15].map((o): DetailBox => ({
      kind: "plate",
      box: {
        centre: {
          x: centre.x + n.x * o,
          y: 0.009,
          z: centre.z + n.z * o,
        },
        size: size(along - 0.06, 0.05, 0.012),
      },
    })),
  ];
}

/** Every new duct, pipe, vent and the lamp (task 23). */
export function ductLayout(): { boxes: DetailBox[]; beams: DetailBeam[] } {
  const F = DUCT_RUNS.flue;
  const S = DUCT_RUNS.stub;
  const B = DUCT_RUNS.backStub;
  return {
    boxes: [
      ...rightDuct(),
      ...backDuct(),
      ...roofExhaust(),
      ...flue(F.side, F.alongM, F.y),
      ...stub(S.side, S.alongM, S.y),
      ...stub(B.side, B.alongM, B.y),
      // More louvred vents low on the front and the left.
      ...vent("front", 4.6, 1.2),
      ...vent("left", -4, 1.4),
      ...backLampParts(),
      ...grate(),
    ],
    beams: [],
  };
}

/** The layout with the ducts added after its own parts (before windows and sign plates). */
export function withDucts(layout: DetailLayout): DetailLayout {
  const ducts = ductLayout();
  return {
    ...layout,
    boxes: [...layout.boxes, ...ducts.boxes],
    beams: [...layout.beams, ...ducts.beams],
  };
}

/** Where steam leaves: some of the new pipes, a duct's cowl, the roof stacks and the grate. */
export function steamVents(): SteamVent[] {
  const top = roofTopY();
  const F = DUCT_RUNS.flue;
  const S = DUCT_RUNS.stub;
  const B = DUCT_RUNS.backStub;
  const R = DUCT_RUNS.roof;
  const right = DUCT_RUNS.right;
  return [
    {
      id: "front-flue",
      position: pointOnSide(F.side, F.alongM, F.y + 0.68, 0.41),
      direction: UP,
      strength: 0.8,
      sizeM: 0.3,
    },
    {
      id: "right-stub",
      position: pointOnSide(S.side, S.alongM, S.y, 0.34),
      direction: sideNormal(S.side),
      strength: 0.65,
      sizeM: 0.25,
    },
    {
      id: "right-cowl",
      position: pointOnSide(
        "right",
        right.riserAlongM,
        DUCT.topY + 0.05,
        DUCT.gapM - 0.03 + DUCT.cowl.outM,
      ),
      direction: sideNormal("right"),
      strength: 0.75,
      sizeM: 0.4,
    },
    {
      id: "back-stub",
      position: pointOnSide(B.side, B.alongM, B.y, 0.34),
      direction: sideNormal(B.side),
      strength: 0.9,
      sizeM: 0.25,
    },
    {
      id: "back-grate",
      position: pointOnSide(
        "back",
        DUCT_RUNS.grate.alongM,
        0.05,
        DUCT_RUNS.grate.outM,
      ),
      direction: UP,
      strength: 1,
      sizeM: 0.5,
    },
    {
      id: "roof-stack",
      position: { x: R.stack.x, y: top + R.stackUpM + 0.04, z: R.stack.z },
      direction: UP,
      strength: 0.85,
      sizeM: 0.35,
    },
    {
      // The roof vent stack from task 14 at (4.2, -3.5), 0.7 m tall under its cap.
      id: "roof-vent",
      position: { x: 4.2, y: top + 0.8, z: -3.5 },
      direction: UP,
      strength: 0.6,
      sizeM: 0.3,
    },
  ];
}
