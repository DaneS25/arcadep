/**
 * The generator (task 28): a giant power block on the left side's pavement, standing
 * against the wall under the skill signs, between the two ground-floor windows. A skid,
 * a heavy main housing with cooling fins, a reactor drum on top, armoured corner posts, a
 * feed duct into the wall, warning stencils and thin slits of dim cold light. Conduit
 * ports on its top (`generatorPlugs`) are where task 29's cable bundles plug in.
 *
 * All of it joins the details mesh (`withGenerator`), so it costs no draw call: the
 * slits glow through the atlas's `glow` patch, the stencils are quads on its `stencil`
 * patch, and the metal takes the props' grime (but no stickers) like everything else. Nothing
 * moves, so reduced motion has nothing to stop. Pure numbers in metres.
 */

import {
  pavementY,
  pointOnSide,
  sideNormal,
  sideTangent,
  type Rect,
  type Side,
  type Vec3,
} from "./buildingLayout";
import {
  DETAIL_TEXTURE,
  detailUv,
  wallBox,
  type DetailBox,
  type DetailLayout,
  type SignFace,
} from "./detailLayout";

/**
 * Where it stands and how big it is. `alongM` and `out` are measured as for the other wall
 * props on the left side (along to the right facing the wall, out from it).
 */
export const GENERATOR = {
  side: "left",
  /** The skid's ends: clear of the windows either side (frames and sills at 0.18 and 3.37). */
  fromAlongM: 0.4,
  toAlongM: 3.2,
  skid: { upM: 0.2, outM: 1.65 },
  /** The main housing: a little in from the skid's ends, standing on it against the wall. */
  housing: { insetM: 0.2, upM: 3, outM: 1.35 },
  /** The reactor drum on the housing's top, towards the front. */
  drum: {
    fromAlongM: 0.75,
    toAlongM: 2.25,
    upM: 0.4,
    nearOutM: 0.5,
    farOutM: 1.3,
  },
  /** Cooling fins on the housing's front: this many, this thick, this far proud. */
  fins: {
    count: 12,
    fromAlongM: 0.8,
    toAlongM: 2.05,
    bottomM: 0.4,
    upM: 2,
    thickM: 0.035,
    outM: 0.18,
  },
  /** The feed duct from the housing's top into the wall, at its right-hand end. */
  feed: { alongM: 2.85, acrossM: 0.4, upM: 0.4, outM: 0.28 },
  /** The conduit ports' collars on top: square, this wide and tall. */
  port: { sizeM: 0.18, upM: 0.14, mouthM: 0.12 },
} as const satisfies { side: Side } & Record<string, unknown>;

const G = GENERATOR;
const SIDE: Side = G.side;

/** The skid's top, which the housing stands on. */
function skidTopY(): number {
  return pavementY() + G.skid.upM;
}

/** The main housing's top, which the drum, feed duct and ports stand on. */
export function housingTopY(): number {
  return skidTopY() + G.housing.upM;
}

/** The housing's ends along the wall. */
function housingSpan(): { from: number; to: number } {
  return {
    from: G.fromAlongM + G.housing.insetM,
    to: G.toAlongM - G.housing.insetM,
  };
}

/** A box on the left wall by its along range, bottom, height and out range. */
function part(
  kind: DetailBox["kind"],
  fromAlongM: number,
  toAlongM: number,
  bottomY: number,
  upM: number,
  nearOutM: number,
  farOutM: number,
): DetailBox {
  return {
    kind,
    // Grime but no stickers: on the housing's top they read as specks (task 28 review).
    noStickers: true,
    box: wallBox(
      SIDE,
      (fromAlongM + toAlongM) / 2,
      bottomY,
      { across: toAlongM - fromAlongM, up: upM, out: farOutM - nearOutM },
      nearOutM,
    ),
  };
}

/** A conduit port: where a cable bundle plugs into the generator, and which way it leaves. */
export type GeneratorPlug = {
  readonly id: string;
  /** The middle of the port's mouth, on top of its collar. */
  readonly position: Vec3;
  /** Unit vector the cable leaves along: straight up, towards the wall it runs down. */
  readonly direction: Vec3;
  /** The collar's width, so a bundle can be sized to fit. */
  readonly sizeM: number;
};

/**
 * The conduit ports, by where they sit on the housing's top: three in a row against the
 * wall behind the drum, and two at the right-hand end in front of the feed duct.
 */
const PORTS: readonly { id: string; alongM: number; outM: number }[] = [
  { id: "port-1", alongM: 0.95, outM: 0.2 },
  { id: "port-2", alongM: 1.5, outM: 0.2 },
  { id: "port-3", alongM: 2.05, outM: 0.2 },
  { id: "port-4", alongM: 2.65, outM: 0.85 },
  { id: "port-5", alongM: 2.95, outM: 0.85 },
];

/** Where task 29's cable bundles plug in: the middle of each conduit port's mouth. */
export function generatorPlugs(): GeneratorPlug[] {
  const top = housingTopY() + G.port.upM + 0.01;
  return PORTS.map((p) => ({
    id: p.id,
    position: pointOnSide(SIDE, p.alongM, top, p.outM),
    direction: { x: 0, y: 1, z: 0 },
    sizeM: G.port.sizeM,
  }));
}

/** The generator's ground footprint (the skid), for litter and wires to keep clear of. */
export function generatorFootprint(): Rect {
  const a = pointOnSide(SIDE, G.fromAlongM, 0, 0);
  const b = pointOnSide(SIDE, G.toAlongM, 0, G.skid.outM);
  return {
    minX: Math.min(a.x, b.x),
    maxX: Math.max(a.x, b.x),
    minZ: Math.min(a.z, b.z),
    maxZ: Math.max(a.z, b.z),
  };
}

/** The generator's outline on its wall (along and up), for task 29's wires to come down to. */
export function generatorWallRect(): {
  side: Side;
  minAlong: number;
  maxAlong: number;
  minY: number;
  maxY: number;
} {
  return {
    side: SIDE,
    minAlong: G.fromAlongM,
    maxAlong: G.toAlongM,
    minY: 0,
    maxY: Math.max(
      ...generatorLayout().boxes.map(
        ({ box }) => box.centre.y + box.size.y / 2,
      ),
    ),
  };
}

/** A stencil quad facing out of a face whose outward normal is `normal`, centred on `centre`. */
function stencil(centre: Vec3, normal: Vec3, sizeM: number): SignFace {
  // Right as seen looking at the face, so that right × up = normal.
  const right = { x: normal.z, y: 0, z: -normal.x };
  const h = sizeM / 2;
  const at = (sr: number, su: number): Vec3 => ({
    x: centre.x + right.x * sr * h,
    y: centre.y + su * h,
    z: centre.z + right.z * sr * h,
  });
  return {
    sign: "stencil",
    quad: {
      corners: [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)],
      normal,
      ...detailUv(DETAIL_TEXTURE.rects.stencil),
    },
  };
}

/** Every part of the generator, and its two stencils. */
export function generatorLayout(): { boxes: DetailBox[]; faces: SignFace[] } {
  const base = skidTopY();
  const top = housingTopY();
  const span = housingSpan();
  const H = G.housing;
  const F = G.fins;
  const D = G.drum;
  const boxes: DetailBox[] = [
    // The skid it stands on, a dark steel frame on the pavement.
    part(
      "frame",
      G.fromAlongM,
      G.toAlongM,
      pavementY(),
      G.skid.upM,
      0,
      G.skid.outM,
    ),
    // The main housing, against the wall.
    part("metal", span.from, span.to, base, H.upM, 0, H.outM),
    // Armoured posts up its two front corners, standing a little proud of it.
    part(
      "plate",
      span.from - 0.03,
      span.from + 0.12,
      base,
      H.upM + 0.06,
      H.outM - 0.12,
      H.outM + 0.04,
    ),
    part(
      "plate",
      span.to - 0.12,
      span.to + 0.03,
      base,
      H.upM + 0.06,
      H.outM - 0.12,
      H.outM + 0.04,
    ),
    // A heavy lid band round the housing's top.
    part(
      "plate",
      span.from - 0.02,
      span.to + 0.02,
      top - 0.16,
      0.12,
      0,
      H.outM + 0.02,
    ),
    // The reactor drum on top, with a cap and a cold slit round its front.
    part("metal", D.fromAlongM, D.toAlongM, top, D.upM, D.nearOutM, D.farOutM),
    part(
      "plate",
      D.fromAlongM - 0.05,
      D.toAlongM + 0.05,
      top + D.upM,
      0.06,
      D.nearOutM - 0.05,
      D.farOutM + 0.05,
    ),
    part(
      "glow",
      D.fromAlongM + 0.1,
      D.toAlongM - 0.1,
      top + D.upM * 0.45,
      0.035,
      D.farOutM,
      D.farOutM + 0.012,
    ),
    // The feed duct from the housing's top into the wall.
    part(
      "metal",
      G.feed.alongM - G.feed.acrossM / 2,
      G.feed.alongM + G.feed.acrossM / 2,
      top,
      G.feed.upM,
      0,
      G.feed.outM,
    ),
    // A flange where it meets the wall.
    part(
      "plate",
      G.feed.alongM - G.feed.acrossM / 2 - 0.05,
      G.feed.alongM + G.feed.acrossM / 2 + 0.05,
      top + 0.08,
      G.feed.upM - 0.12,
      0,
      0.04,
    ),
    // A cold strip of light along the housing's front, under the lid band.
    part(
      "glow",
      span.from + 0.2,
      span.to - 0.2,
      top - 0.3,
      0.06,
      H.outM,
      H.outM + 0.012,
    ),
    // Three tall slits beside the fins, and a gauge window under the stencil.
    ...[2.25, 2.4, 2.55].map((a) =>
      part(
        "glow",
        a - 0.025,
        a + 0.025,
        base + 0.45,
        1.3,
        H.outM,
        H.outM + 0.012,
      ),
    ),
    part("plate", 2.17, 2.63, base + 0.3, 1.6, H.outM, H.outM + 0.008),
    // A bolted access panel low down, and a heavy cable gland box on the housing's end.
    part(
      "plate",
      F.fromAlongM - 0.05,
      F.toAlongM + 0.05,
      base + 0.12,
      0.2,
      H.outM,
      H.outM + 0.03,
    ),
    part("plate", span.to, span.to + 0.14, base + 0.6, 0.5, 0.3, 0.8),
  ];
  // Cooling fins, evenly spaced across the housing's front (dark painted, so no stickers).
  for (let i = 0; i < F.count; i += 1) {
    const a = F.fromAlongM + ((F.toAlongM - F.fromAlongM) * i) / (F.count - 1);
    boxes.push(
      part(
        "frame",
        a - F.thickM / 2,
        a + F.thickM / 2,
        base + F.bottomM,
        F.upM,
        H.outM,
        H.outM + F.outM,
      ),
    );
  }
  // Conduit port collars, each with a dark mouth on top.
  const P = G.port;
  for (const p of PORTS) {
    boxes.push(
      part(
        "metal",
        p.alongM - P.sizeM / 2,
        p.alongM + P.sizeM / 2,
        top,
        P.upM,
        p.outM - P.sizeM / 2,
        p.outM + P.sizeM / 2,
      ),
      part(
        "cable",
        p.alongM - P.mouthM / 2,
        p.alongM + P.mouthM / 2,
        top + P.upM,
        0.008,
        p.outM - P.mouthM / 2,
        p.outM + P.mouthM / 2,
      ),
    );
  }

  const n = sideNormal(SIDE);
  const t = sideTangent(SIDE);
  const faces: SignFace[] = [
    // On the housing's front, over the slits.
    stencil(pointOnSide(SIDE, 2.4, base + 2.3, H.outM + 0.006), n, 0.5),
    // On the housing's end facing the street (+along), seen from the front-left.
    stencil(pointOnSide(SIDE, span.to + 0.004, base + 1.9, 0.6), t, 0.6),
  ];
  return { boxes, faces };
}

/** The layout with the generator added after its own parts (before windows and sign plates). */
export function withGenerator(layout: DetailLayout): DetailLayout {
  const g = generatorLayout();
  return {
    ...layout,
    boxes: [...layout.boxes, ...g.boxes],
    faces: [...layout.faces, ...g.faces],
  };
}
