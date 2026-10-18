/**
 * Two street lamps (task 40, restyled in task 41): old wrought-iron lamps at the kerb in
 * front of the front and back walls, at diagonally opposite ends. Each has a dark iron post
 * on a stepped, decorative base, a scrollwork bracket reaching towards the wall, and a
 * lantern with glowing glass panes hanging from the bracket about level with the first
 * floor. Their warm orange light lights the walls and pavement nearby, so the building
 * reads better; the neon signs still lead. Warm orange is allowed for these two lamps only
 * (user, 2026-10-18): signs and every other light stay red, purple or cyan.
 *
 * Steady: no flicker, the same under reduced motion. The iron and the glass join the
 * details mesh (no draw call); the scene adds one point light inside each lantern. Pure
 * numbers in metres.
 */

import { pavementY, type Box, type Rect, type Vec3 } from "./buildingLayout";
import type { DetailBeam, DetailBox } from "./detailTypes";

export type StreetLamp = {
  readonly id: string;
  /** The post's centre on the ground. */
  readonly x: number;
  readonly z: number;
  /** Which way the bracket reaches from the post, towards the building (a unit step on x or z). */
  readonly arm: { readonly x: number; readonly z: number };
};

export const STREET_LAMP = {
  /** The post: a slim square iron bar. */
  poleM: 0.1,
  /** The base's bottom step, its widest part (its footprint on the pavement). */
  foot: { sizeM: 0.36, upM: 0.1 },
  /** The base's upper steps, narrowing up the post: side and height of each. */
  steps: [
    { sizeM: 0.27, upM: 0.16 },
    { sizeM: 0.19, upM: 0.32 },
    { sizeM: 0.15, upM: 0.05 },
  ],
  /** A collar ring part way up the post, and one just under the bracket. */
  collar: { sizeM: 0.15, upM: 0.05, atY: 1.25 },
  /** The bracket's top bar: its underside, its reach to the lantern and its thickness. */
  armY: 5.45,
  armM: 0.9,
  armThickM: 0.06,
  /** The post runs this far over the bar, under a cap and a spike. */
  finialM: 0.14,
  /** Scrollwork under the bar: round iron this thick. */
  scrollThickM: 0.03,
  /** The lantern: glass panes in a thin iron frame, under a stepped roof. */
  hangerM: 0.08,
  roof: { across: 0.36, up: 0.07 },
  roofTop: { across: 0.16, up: 0.05 },
  glass: { across: 0.24, up: 0.34 },
  frameM: 0.03,
  floor: { across: 0.28, up: 0.04 },
  drop: { across: 0.06, up: 0.08 },
  /** The point light sits this far under the glass's centre. */
  lightDropM: 0.1,
} as const;

/**
 * The two lamps, diagonally opposite and both at the kerb (task 41: the back one moved out
 * from the middle of the alley's 4 m pavement): one by the front kerb towards the front
 * wall's left end (left of the cabinet, as the visitor sees it), one by the alley's kerb
 * towards the back wall's left end (as seen from the alley). Each foot stands 0.02 m in from
 * the kerb stones. Both clear every stop's view (tested).
 */
export const STREET_LAMPS: readonly StreetLamp[] = [
  { id: "lamp-front", x: -5.6, z: 7.5, arm: { x: 0, z: -1 } },
  { id: "lamp-back", x: 5.6, z: -8.5, arm: { x: 0, z: 1 } },
];

const S = STREET_LAMP;

const box = (centre: Vec3, size: Vec3): Box => ({ centre, size });

/** A size along the arm (`along`) and across it (`across`), on the ground axes. */
const sized = (
  lamp: StreetLamp,
  along: number,
  up: number,
  across: number,
): Vec3 =>
  lamp.arm.x === 0
    ? { x: across, y: up, z: along }
    : { x: along, y: up, z: across };

/** A point `along` metres out from the post along the arm, at height `y`. */
const out = (lamp: StreetLamp, along: number, y: number): Vec3 => ({
  x: lamp.x + lamp.arm.x * along,
  y,
  z: lamp.z + lamp.arm.z * along,
});

/** The lantern glass's top: the roof sits on it, the hanger above. */
function glassTopY(): number {
  return S.armY - S.hangerM - S.roofTop.up - S.roof.up;
}

/** The lantern glass's centre (the old bulb's place). */
export function bulbCentre(lamp: StreetLamp): Vec3 {
  return out(lamp, S.armM, glassTopY() - S.glass.up / 2);
}

/** Where a lamp's point light sits: inside the lantern, just under the glass's centre. */
export function lampLightPosition(lamp: StreetLamp): Vec3 {
  const b = bulbCentre(lamp);
  return { ...b, y: b.y - S.lightDropM };
}

/** Points round an arc in the arm's vertical plane, centred `along` out and `y` up. */
function arc(
  lamp: StreetLamp,
  centre: { along: number; y: number },
  radius: (t: number) => number,
  fromRad: number,
  toRad: number,
  segments: number,
): Vec3[] {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments;
    const a = fromRad + (toRad - fromRad) * t;
    const r = radius(t);
    return out(
      lamp,
      centre.along + r * Math.cos(a),
      centre.y + r * Math.sin(a),
    );
  });
}

/** One beam per pair of neighbouring points. */
function polyline(points: readonly Vec3[]): DetailBeam[] {
  return points.slice(1).map((to, i) => ({
    kind: "iron",
    from: points[i] ?? to,
    to,
    thicknessM: S.scrollThickM,
  }));
}

/**
 * A lamp's wrought iron (base, post, collars, finial, bracket bar and the lantern's roof,
 * frame and floor), the bracket's scrollwork as thin round bars, and its glowing glass.
 */
export function streetLampParts(lamp: StreetLamp): {
  boxes: DetailBox[];
  beams: DetailBeam[];
  bulb: DetailBox;
} {
  const ground = pavementY();
  const iron = (b: Box): DetailBox => ({
    kind: "iron",
    noStickers: true,
    box: b,
  });
  /** A square block on the post's axis (or the lantern's) from `bottom`, `side` wide and `up` tall. */
  const block = (
    along: number,
    bottom: number,
    side: number,
    up: number,
  ): DetailBox =>
    iron(box(out(lamp, along, bottom + up / 2), { x: side, y: up, z: side }));

  // The stepped base and the collars.
  const boxes: DetailBox[] = [block(0, ground, S.foot.sizeM, S.foot.upM)];
  let y = ground + S.foot.upM;
  for (const step of S.steps) {
    boxes.push(block(0, y, step.sizeM, step.upM));
    y += step.upM;
  }
  const barTop = S.armY + S.armThickM;
  const postTop = barTop + S.finialM;
  boxes.push(
    block(0, ground + S.collar.atY, S.collar.sizeM, S.collar.upM),
    block(0, S.armY - 0.3, S.collar.sizeM, S.collar.upM),
    // The post, the cap on top and its spike.
    block(0, y, S.poleM, postTop - y),
    block(0, postTop, 0.14, 0.04),
    block(0, postTop + 0.04, 0.05, 0.12),
  );
  // The bracket's top bar, from the post to just past the lantern, with a knob at its end.
  const barEnd = S.armM + 0.08;
  boxes.push(
    iron(
      box(
        out(lamp, barEnd / 2, S.armY + S.armThickM / 2),
        sized(lamp, barEnd, S.armThickM, 0.05),
      ),
    ),
    block(barEnd, S.armY - 0.01, 0.08, 0.08),
  );
  // The lantern: hanger, stepped roof, four corner bars round the glass, floor and drop.
  const glassTop = glassTopY();
  const glassBottom = glassTop - S.glass.up;
  const corner = S.glass.across / 2;
  boxes.push(
    block(S.armM, glassTop + S.roof.up + S.roofTop.up, 0.04, S.hangerM),
    block(S.armM, glassTop + S.roof.up, S.roofTop.across, S.roofTop.up),
    block(S.armM, glassTop, S.roof.across, S.roof.up),
    ...[
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ].map(([a, c]) => {
      const centre = out(lamp, S.armM + (a ?? 0) * corner, 0);
      // `c` steps across the arm: along x when the arm runs along z, and the other way round.
      const across = (c ?? 0) * corner;
      return iron(
        box(
          {
            x: centre.x + (lamp.arm.x === 0 ? across : 0),
            y: glassBottom + S.glass.up / 2,
            z: centre.z + (lamp.arm.x === 0 ? 0 : across),
          },
          { x: S.frameM, y: S.glass.up, z: S.frameM },
        ),
      );
    }),
    block(S.armM, glassBottom - S.floor.up, S.floor.across, S.floor.up),
    block(
      S.armM,
      glassBottom - S.floor.up - S.drop.up,
      S.drop.across,
      S.drop.up,
    ),
  );

  // Scrollwork under the bar: a diagonal brace from the post up to the bar, a spiral curl
  // in the corner between the post and the bar, and a smaller one where the brace meets
  // the bar.
  const braceFoot = { along: S.poleM / 2, y: S.armY - 0.55 };
  const braceTop = { along: 0.62, y: S.armY };
  const beams: DetailBeam[] = [
    ...polyline([
      out(lamp, braceFoot.along, braceFoot.y),
      out(lamp, braceTop.along, braceTop.y),
    ]),
    // Tangent to the post at its widest, winding in to a small eye.
    ...polyline(
      arc(
        lamp,
        { along: S.poleM / 2 + 0.13, y: S.armY - 0.14 },
        (t) => 0.13 - 0.08 * t,
        Math.PI,
        Math.PI - 2.4 * Math.PI,
        14,
      ),
    ),
    ...polyline(
      arc(
        lamp,
        { along: braceTop.along - 0.08, y: S.armY - 0.07 },
        (t) => 0.06 - 0.035 * t,
        Math.PI / 2,
        Math.PI / 2 + 2 * Math.PI,
        10,
      ),
    ),
  ];

  return {
    boxes,
    beams,
    bulb: {
      kind: "light",
      noStickers: true,
      glow: "street",
      box: box(
        bulbCentre(lamp),
        sized(lamp, S.glass.across, S.glass.up, S.glass.across),
      ),
    },
  };
}

/** Every lamp's boxes: the iron first, then the glowing glass. */
export function streetLampBoxes(
  lamps: readonly StreetLamp[] = STREET_LAMPS,
): DetailBox[] {
  const parts = lamps.map(streetLampParts);
  return [...parts.flatMap((p) => p.boxes), ...parts.map((p) => p.bulb)];
}

/** Every lamp's scrollwork bars. */
export function streetLampBeams(
  lamps: readonly StreetLamp[] = STREET_LAMPS,
): DetailBeam[] {
  return lamps.flatMap((l) => streetLampParts(l).beams);
}

/** The box round a beam (for overlap and sight-line checks). */
export function beamBounds(beam: DetailBeam): Box {
  const h = beam.thicknessM / 2;
  const span = (axis: "x" | "y" | "z"): number =>
    Math.abs(beam.to[axis] - beam.from[axis]) + 2 * h;
  return box(
    {
      x: (beam.from.x + beam.to.x) / 2,
      y: (beam.from.y + beam.to.y) / 2,
      z: (beam.from.z + beam.to.z) / 2,
    },
    { x: span("x"), y: span("y"), z: span("z") },
  );
}

/** The lamps' feet on the ground, for litter to keep clear of. */
export function streetLampFootprints(marginM = 0): Rect[] {
  return STREET_LAMPS.map((l) => ({
    minX: l.x - S.foot.sizeM / 2 - marginM,
    maxX: l.x + S.foot.sizeM / 2 + marginM,
    minZ: l.z - S.foot.sizeM / 2 - marginM,
    maxZ: l.z + S.foot.sizeM / 2 + marginM,
  }));
}

/** The layout with the street lamps added after its own boxes and beams. */
export function withStreetLamps<
  L extends {
    readonly boxes: readonly DetailBox[];
    readonly beams: readonly DetailBeam[];
  },
>(layout: L): L {
  return {
    ...layout,
    boxes: [...layout.boxes, ...streetLampBoxes()],
    beams: [...layout.beams, ...streetLampBeams()],
  };
}
