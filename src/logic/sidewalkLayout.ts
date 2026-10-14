/**
 * The pavement and its edges (task 24): a cracked, grimy pavement all the way round the
 * building, kerb stones, drains, litter and bin bags, and the street beyond the kerb fading
 * to black. Pure numbers in metres, from a fixed seed, so every load looks the same.
 *
 * - The pavement's grime is a top-down texture (`sidewalkGrimeMarks`, drawn by
 *   `scene/grime.ts` with the task 22 marks): slab and kerb joints, cracks, broken and
 *   patched slabs, oil, gum, dirt at the foot of the walls and in the gutter, wet rings
 *   round the puddles and rust round the drains.
 * - Drains, litter and bin bags join the details mesh (`withSidewalk`), so they cost no
 *   draw call.
 * - Past the kerb the street fades out (`streetFade`, mirrored in the street's shader), so
 *   nothing beyond the pavement shows; the scene's exposure and fill light are unchanged.
 */

import type { GeometryData } from "./boxGeometry";
import {
  BUILDING,
  STREET,
  buildingFootprint,
  interactionSpots,
  pavementY,
  pointOnSide,
  sideNormal,
  sidewalkRect,
  wallOpenings,
  type Box,
  type Rect,
  type Side,
} from "./buildingLayout";
import { DUCT_RUNS } from "./ductLayout";
import {
  DETAIL_SIZES,
  PUDDLES,
  type DetailBox,
  type DetailLayout,
} from "./detailLayout";
import { crack, raggedPolygon, type GrimeMark } from "./grimeLayout";
import { createRng, type Rng } from "./rng";
import { SIDE_DOOR, TERMINAL_SIDE } from "./terminalLayout";

export const SIDEWALK = {
  seed: 0x51de_3a1c,
  /** Paving slabs this long between the joints; kerb stones this long. */
  slabM: 1.5,
  kerbStoneM: 1,
  /** Bits of rubbish scattered over the pavement (cans, paper, cups, flattened boxes). */
  litterCount: 40,
  /** Litter and stains keep this far off the walls (the drain pipes stand 0.2 to 0.32 m out). */
  wallClearM: 0.36,
} as const;

/**
 * The pavement's grime texture: 2048 px square over 18 x 18 m (about 114 px a metre),
 * centred so it holds the whole pavement (18 x 17 m), kerbs included.
 */
export const SIDEWALK_GRIME = {
  sizePx: 2048,
  extentM: 18,
  centre: { x: 0, z: -0.5 },
} as const;

/**
 * The street past the kerb: full brightness up to `startM` out (the gutter beside the
 * kerb), black by `endM`, so the eye stays on the building. The street slab ends a little
 * past that, where it is already black.
 */
export const EDGE_FADE = {
  startM: 0,
  endM: 0.6,
  /** The street slab reaches this far past the kerb. */
  slabM: 1,
} as const;

/** How far a ground point lies outside the pavement (0 on or inside it). */
export function edgeDistanceM(x: number, z: number): number {
  const r = sidewalkRect();
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.hypot(dx, dz);
}

const smoothstep = (a: number, b: number, t: number): number => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** How much of the street's light is left at a ground point: 1 by the kerb, 0 past the fade. */
export function streetFade(x: number, z: number): number {
  return 1 - smoothstep(EDGE_FADE.startM, EDGE_FADE.endM, edgeDistanceM(x, z));
}

/** The street slab (top at y = 0): the pavement plus `EDGE_FADE.slabM` all round. */
export function streetBox(thicknessM = 0.1): Box {
  const r = sidewalkRect();
  const m = EDGE_FADE.slabM;
  return {
    centre: {
      x: (r.minX + r.maxX) / 2,
      y: -thicknessM / 2,
      z: (r.minZ + r.maxZ) / 2,
    },
    size: {
      x: r.maxX - r.minX + 2 * m,
      y: thicknessM,
      z: r.maxZ - r.minZ + 2 * m,
    },
  };
}

/** The pavement inside the kerb stones. */
export function insideKerbRect(): Rect {
  const r = sidewalkRect();
  const k = STREET.kerbWidthM;
  return {
    minX: r.minX + k,
    maxX: r.maxX - k,
    minZ: r.minZ + k,
    maxZ: r.maxZ - k,
  };
}

/** A box's footprint on the ground, grown by `marginM` all round. */
export function groundRect(box: Box, marginM = 0): Rect {
  return {
    minX: box.centre.x - box.size.x / 2 - marginM,
    maxX: box.centre.x + box.size.x / 2 + marginM,
    minZ: box.centre.z - box.size.z / 2 - marginM,
    maxZ: box.centre.z + box.size.z / 2 + marginM,
  };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ
  );
}

/** A drain grate set into the pavement against the kerb: centre, and whether it runs along x. */
export type Drain = {
  readonly x: number;
  readonly z: number;
  readonly alongX: boolean;
};

const DRAIN_SIZE = { alongM: 0.6, acrossM: 0.4 } as const;
/** A drain's centre line, just inside the kerb stones. */
const DRAIN_IN = STREET.kerbWidthM + DRAIN_SIZE.acrossM / 2 + 0.02;

/** Gully grates by the kerb on every side (the alley's grate from task 23 is extra). */
export function drains(): Drain[] {
  const r = sidewalkRect();
  return [
    { x: 5.2, z: r.maxZ - DRAIN_IN, alongX: true },
    { x: -8.1, z: r.maxZ - DRAIN_IN, alongX: true },
    { x: r.minX + DRAIN_IN, z: 2.6, alongX: false },
    { x: r.maxX - DRAIN_IN, z: -7, alongX: false },
    { x: 0.6, z: r.minZ + DRAIN_IN, alongX: true },
  ];
}

/** A grate lying on the pavement: a dark frame and four bars, a few millimetres proud. */
export function drainParts(drain: Drain): DetailBox[] {
  const y = pavementY();
  const a = DRAIN_SIZE.alongM;
  const c = DRAIN_SIZE.acrossM;
  const size = (along: number, across: number, h: number) =>
    drain.alongX
      ? { x: along, y: h, z: across }
      : { x: across, y: h, z: along };
  const parts: DetailBox[] = [
    {
      kind: "cable",
      box: {
        centre: { x: drain.x, y: y + 0.002, z: drain.z },
        size: size(a, c, 0.004),
      },
    },
  ];
  for (const t of [-0.15, -0.05, 0.05, 0.15]) {
    const offset = t * c * 2;
    parts.push({
      kind: "plate",
      box: {
        centre: {
          x: drain.x + (drain.alongX ? 0 : offset),
          y: y + 0.007,
          z: drain.z + (drain.alongX ? offset : 0),
        },
        size: size(a - 0.06, 0.04, 0.01),
      },
    });
  }
  return parts;
}

/** A bin bag: a lumpy black sack (two boxes) and its tied neck. */
function binBag(x: number, z: number, scale: number): DetailBox[] {
  const y = pavementY();
  const w = 0.55 * scale;
  const h = 0.45 * scale;
  return [
    {
      kind: "cable",
      box: { centre: { x, y: y + h / 2, z }, size: { x: w, y: h, z: w * 0.9 } },
    },
    {
      kind: "cable",
      box: {
        centre: { x: x + 0.04, y: y + h + 0.06 * scale, z },
        size: { x: w * 0.7, y: 0.12 * scale, z: w * 0.6 },
      },
    },
    {
      kind: "cable",
      box: {
        centre: { x, y: y + h + 0.18 * scale, z },
        size: { x: 0.08, y: 0.12 * scale, z: 0.08 },
      },
    },
  ];
}

/** Bin bags heaped by the back doors' corners, out of the way of the doors and the posters. */
export function binBags(): DetailBox[] {
  const at = (alongM: number, outM: number) =>
    pointOnSide("back", alongM, 0, outM);
  const a = at(-6.35, 0.62);
  const b = at(-7.0, 0.95);
  const c = at(-6.6, 1.5);
  const d = at(6.75, 0.65);
  return [
    ...binBag(a.x, a.z, 1),
    ...binBag(b.x, b.z, 0.85),
    ...binBag(c.x, c.z, 0.9),
    ...binBag(d.x, d.z, 0.95),
  ];
}

/** Ground rectangles litter keeps out of: doors, spots, puddles, drains, the grate, bags. */
export function litterKeepOut(): Rect[] {
  const rects: Rect[] = [];
  // In front of every ground-floor door, where it swings and people walk.
  for (const o of wallOpenings()) {
    if (o.kind !== "door" || o.floor !== 0) continue;
    rects.push(doorApron(o.side, o.alongM, o.widthM));
  }
  rects.push(doorApron(TERMINAL_SIDE, SIDE_DOOR.alongM, SIDE_DOOR.widthM));
  for (const spot of interactionSpots()) {
    const n = sideNormal(spot.side);
    const alongX = n.x === 0;
    rects.push(
      groundRect(
        {
          centre: spot.position,
          size: {
            x: alongX ? spot.size.x : spot.size.z,
            y: spot.size.y,
            z: alongX ? spot.size.z : spot.size.x,
          },
        },
        0.2,
      ),
    );
  }
  for (const p of PUDDLES)
    rects.push({
      minX: p.x - p.sizeX / 2 - 0.1,
      maxX: p.x + p.sizeX / 2 + 0.1,
      minZ: p.z - p.sizeZ / 2 - 0.1,
      maxZ: p.z + p.sizeZ / 2 + 0.1,
    });
  for (const d of drains())
    for (const part of drainParts(d)) rects.push(groundRect(part.box, 0.1));
  for (const part of binBags()) rects.push(groundRect(part.box, 0.15));
  const g = pointOnSide(
    "back",
    DUCT_RUNS.grate.alongM,
    0,
    DUCT_RUNS.grate.outM,
  );
  rects.push({
    minX: g.x - 0.6,
    maxX: g.x + 0.6,
    minZ: g.z - 0.45,
    maxZ: g.z + 0.45,
  });
  return rects;
}

function doorApron(side: Side, alongM: number, widthM: number): Rect {
  const a = pointOnSide(side, alongM - widthM / 2 - 0.3, 0, 0);
  const b = pointOnSide(side, alongM + widthM / 2 + 0.3, 0, 1.4);
  return {
    minX: Math.min(a.x, b.x),
    maxX: Math.max(a.x, b.x),
    minZ: Math.min(a.z, b.z),
    maxZ: Math.max(a.z, b.z),
  };
}

/** A random point on the pavement inside the kerb, clear of the walls by `wallClearM`. */
function pavementPoint(rng: Rng, wallClearM: number = SIDEWALK.wallClearM) {
  const inner = insideKerbRect();
  const fp = buildingFootprint();
  for (;;) {
    const x = rng.range(inner.minX, inner.maxX);
    const z = rng.range(inner.minZ, inner.maxZ);
    const inBuilding =
      x > fp.minX - wallClearM &&
      x < fp.maxX + wallClearM &&
      z > fp.minZ - wallClearM &&
      z < fp.maxZ + wallClearM;
    if (!inBuilding) return { x, z };
  }
}

type LitterKind = { kind: DetailBox["kind"]; size: [number, number, number] };

/** What gets dropped: (x, height, z) before a random quarter turn. */
const LITTER_KINDS: readonly LitterKind[] = [
  // A sheet of paper or a flyer, flat.
  { kind: "board", size: [0.21, 0.004, 0.3] },
  { kind: "board", size: [0.15, 0.004, 0.21] },
  // A crushed can, lying on its side.
  { kind: "plate", size: [0.12, 0.06, 0.07] },
  // A paper cup on its side.
  { kind: "board", size: [0.1, 0.08, 0.08] },
  // A flattened cardboard box.
  { kind: "board", size: [0.62, 0.012, 0.42] },
  // A takeaway box.
  { kind: "frame", size: [0.2, 0.06, 0.14] },
  // A bottle on its side.
  { kind: "cable", size: [0.26, 0.07, 0.07] },
];

/**
 * Rubbish scattered over the pavement, each piece lying flat on it, clear of the walls,
 * the kerb stones, the doors, the spots, the puddles, the drains and each other.
 */
export function litter(
  count: number = SIDEWALK.litterCount,
  seed: number = SIDEWALK.seed,
): DetailBox[] {
  const rng = createRng(seed);
  const keepOut = litterKeepOut();
  const placed: Rect[] = [];
  const parts: DetailBox[] = [];
  const y = pavementY();
  const fp = buildingFootprint();
  const c = SIDEWALK.wallClearM;
  const walls: Rect = {
    minX: fp.minX - c,
    maxX: fp.maxX + c,
    minZ: fp.minZ - c,
    maxZ: fp.maxZ + c,
  };
  let tries = 0;
  while (parts.length < count && tries < count * 60) {
    tries += 1;
    const item = rng.pick(LITTER_KINDS) ?? LITTER_KINDS[0];
    if (item === undefined) break;
    const turned = rng.next() < 0.5;
    const [sx, sy, sz] = item.size;
    const size = turned ? { x: sz, y: sy, z: sx } : { x: sx, y: sy, z: sz };
    const p = pavementPoint(rng);
    const box: Box = {
      centre: { x: p.x, y: y + 0.001 + size.y / 2, z: p.z },
      size,
    };
    const inner = insideKerbRect();
    const r = groundRect(box);
    const inside =
      r.minX > inner.minX + 0.02 &&
      r.maxX < inner.maxX - 0.02 &&
      r.minZ > inner.minZ + 0.02 &&
      r.maxZ < inner.maxZ - 0.02;
    if (!inside) continue;
    if (rectsOverlap(r, walls)) continue;
    if (keepOut.some((k) => rectsOverlap(k, r))) continue;
    const spaced = groundRect(box, 0.08);
    if (placed.some((k) => rectsOverlap(k, spaced))) continue;
    placed.push(r);
    parts.push({ kind: item.kind, box });
  }
  return parts;
}

/** Everything the pavement adds to the details mesh: drains, bin bags and litter. */
export function sidewalkProps(): DetailBox[] {
  return [...drains().flatMap(drainParts), ...binBags(), ...litter()];
}

/** The layout with the pavement's props added after its own parts (before windows and plates). */
export function withSidewalk(layout: DetailLayout): DetailLayout {
  return { ...layout, boxes: [...layout.boxes, ...sidewalkProps()] };
}

/** Grime texture pixels per metre. */
export function sidewalkPxPerM(): number {
  return SIDEWALK_GRIME.sizePx / SIDEWALK_GRIME.extentM;
}

/** A ground point as grime texture pixels (top-left origin; +z runs down the canvas). */
export function sidewalkPixel(x: number, z: number): { x: number; y: number } {
  const g = SIDEWALK_GRIME;
  const s = sidewalkPxPerM();
  return {
    x: (x - g.centre.x + g.extentM / 2) * s,
    y: (z - g.centre.z + g.extentM / 2) * s,
  };
}

/** The grime texture UV under a ground point (the canvas is flipped on upload, so `v` runs up). */
export function sidewalkGrimeUv(x: number, z: number): [number, number] {
  const p = sidewalkPixel(x, z);
  return [p.x / SIDEWALK_GRIME.sizePx, 1 - p.y / SIDEWALK_GRIME.sizePx];
}

/** `sidewalkGrimeUv` for every vertex, seen from above (the kerb faces take their edge's texels). */
export function sidewalkGrimeUvs(data: GeometryData): number[] {
  const uvs: number[] = [];
  for (let i = 0; i < data.positions.length; i += 3)
    uvs.push(
      ...sidewalkGrimeUv(data.positions[i] ?? 0, data.positions[i + 2] ?? 0),
    );
  return uvs;
}

/** A straight soft line between ground points (`along` is x, `y` is z in the pavement's marks). */
function line(
  tint: "crack" | "soot" | "chip" | "scratch" | "water",
  points: (readonly [number, number])[],
  widthM: number,
  strength: number,
): GrimeMark {
  return { kind: "line", tint, points, widthM, strength };
}

/** The slab joints: across each strip of pavement every `slabM`, plus the kerb's own joints. */
function joints(): GrimeMark[] {
  const r = sidewalkRect();
  const inner = insideKerbRect();
  const fp = buildingFootprint();
  const k = STREET.kerbWidthM;
  const marks: GrimeMark[] = [];
  const s = SIDEWALK.slabM;
  const joint = (a: [number, number], b: [number, number]): void => {
    marks.push(line("crack", [a, b], 0.012, 0.45));
  };
  for (let x = Math.ceil(inner.minX / s) * s; x < inner.maxX; x += s) {
    joint([x, fp.maxZ], [x, inner.maxZ]);
    joint([x, inner.minZ], [x, fp.minZ]);
  }
  for (let z = Math.ceil(inner.minZ / s) * s; z < inner.maxZ; z += s) {
    joint([inner.minX, z], [fp.minX, z]);
    joint([fp.maxX, z], [inner.maxX, z]);
  }
  // Where the slabs meet the kerb stones, and the gaps between the kerb stones.
  marks.push(
    line(
      "crack",
      [
        [inner.minX, inner.minZ],
        [inner.maxX, inner.minZ],
        [inner.maxX, inner.maxZ],
        [inner.minX, inner.maxZ],
        [inner.minX, inner.minZ],
      ],
      0.016,
      0.55,
    ),
  );
  const ks = SIDEWALK.kerbStoneM;
  for (let x = r.minX + ks; x < r.maxX; x += ks) {
    joint([x, r.minZ], [x, r.minZ + k]);
    joint([x, r.maxZ - k], [x, r.maxZ]);
  }
  for (let z = r.minZ + ks; z < r.maxZ; z += ks) {
    joint([r.minX, z], [r.minX + k, z]);
    joint([r.maxX - k, z], [r.maxX, z]);
  }
  return marks;
}

/** Where the drain pipes come down to the pavement (they spill water round their feet). */
export function pipeFeet(): { x: number; z: number }[] {
  const halfW = BUILDING.widthM / 2;
  const halfD = BUILDING.depthM / 2;
  const out = DETAIL_SIZES.pipeGapM + DETAIL_SIZES.pipeM / 2;
  return [
    pointOnSide("back", -halfW + 0.5, 0, out),
    pointOnSide("back", halfW - 0.5, 0, out),
    pointOnSide("right", -halfD + 0.4, 0, out),
    pointOnSide("left", -halfD + 0.4, 0, out),
  ].map((p) => ({ x: p.x, z: p.z }));
}

/** A crack's points up to where it would first run off the pavement. */
function onPavement(
  points: readonly (readonly [number, number])[],
): (readonly [number, number])[] {
  const r = sidewalkRect();
  const kept: (readonly [number, number])[] = [];
  for (const p of points) {
    if (p[0] < r.minX || p[0] > r.maxX || p[1] < r.minZ || p[1] > r.maxZ) break;
    kept.push(p);
  }
  return kept;
}

/**
 * Every mark on the pavement, from the same seed on every load, in metres on the ground
 * (`along` is x, `y` is z). In drawing order: the weathered kerb, big damp, salt and soot
 * patches, dirt at the wall foot and in the gutter, wet rings round the puddles and pipe
 * feet, rust round the drains, oil and gum, patched and broken slabs, scuffs, then the
 * joints and cracks on top.
 */
export function sidewalkGrimeMarks(seed: number = SIDEWALK.seed): GrimeMark[] {
  const rng = createRng(seed ^ 0x9e37);
  const r = sidewalkRect();
  const inner = insideKerbRect();
  const fp = buildingFootprint();
  const k = STREET.kerbWidthM;
  const marks: GrimeMark[] = [];

  // Kerb stones worn paler on top, with a dark line of dirt along their outer edge.
  const kerbLine = (inset: number): [number, number][] => [
    [r.minX + inset, r.minZ + inset],
    [r.maxX - inset, r.minZ + inset],
    [r.maxX - inset, r.maxZ - inset],
    [r.minX + inset, r.maxZ - inset],
    [r.minX + inset, r.minZ + inset],
  ];
  marks.push(line("chip", kerbLine(k / 2), k, 0.5));
  marks.push(line("soot", kerbLine(0.015), 0.04, 0.7));

  // Big weathered patches: damp (glossy), chalky salt and soot.
  for (let i = 0; i < 46; i += 1) {
    const p = pavementPoint(rng, 0);
    const roll = rng.next();
    marks.push({
      kind: "stain",
      tint: roll < 0.45 ? "damp" : roll < 0.7 ? "salt" : "soot",
      along: p.x,
      y: p.z,
      radiusM: rng.range(0.4, 1.3),
      strength: roll < 0.45 ? rng.range(0.4, 0.7) : rng.range(0.2, 0.4),
    });
  }

  // Dirt washed against the foot of the walls and into the gutter by the kerb.
  const edgeRuns: { from: [number, number]; to: [number, number] }[] = [
    { from: [fp.minX, fp.maxZ + 0.15], to: [fp.maxX, fp.maxZ + 0.15] },
    { from: [fp.minX, fp.minZ - 0.15], to: [fp.maxX, fp.minZ - 0.15] },
    { from: [fp.minX - 0.15, fp.minZ], to: [fp.minX - 0.15, fp.maxZ] },
    { from: [fp.maxX + 0.15, fp.minZ], to: [fp.maxX + 0.15, fp.maxZ] },
    {
      from: [inner.minX, inner.maxZ - 0.12],
      to: [inner.maxX, inner.maxZ - 0.12],
    },
    {
      from: [inner.minX, inner.minZ + 0.12],
      to: [inner.maxX, inner.minZ + 0.12],
    },
    {
      from: [inner.minX + 0.12, inner.minZ],
      to: [inner.minX + 0.12, inner.maxZ],
    },
    {
      from: [inner.maxX - 0.12, inner.minZ],
      to: [inner.maxX - 0.12, inner.maxZ],
    },
  ];
  for (const run of edgeRuns) {
    const length = Math.hypot(run.to[0] - run.from[0], run.to[1] - run.from[1]);
    for (let d = 0; d < length; d += rng.range(0.3, 0.6)) {
      const t = d / length;
      marks.push({
        kind: "stain",
        tint: "soot",
        along: run.from[0] + (run.to[0] - run.from[0]) * t,
        y: run.from[1] + (run.to[1] - run.from[1]) * t,
        radiusM: rng.range(0.18, 0.42),
        strength: rng.range(0.3, 0.55),
      });
    }
  }

  // Wet, glossy rings round the puddles and the drain pipes' feet.
  for (const p of PUDDLES)
    marks.push({
      kind: "stain",
      tint: "water",
      along: p.x,
      y: p.z,
      radiusM: Math.max(p.sizeX, p.sizeZ) * 0.7,
      strength: 0.75,
    });
  for (const p of pipeFeet())
    marks.push({
      kind: "stain",
      tint: "water",
      along: p.x,
      y: p.z,
      radiusM: rng.range(0.45, 0.7),
      strength: 0.7,
    });

  // Rust bled out round the drains.
  for (const d of drains())
    marks.push({
      kind: "stain",
      tint: "rust",
      along: d.x,
      y: d.z,
      radiusM: rng.range(0.35, 0.5),
      strength: rng.range(0.45, 0.6),
    });

  // Oil stains, then a scatter of trodden-in gum.
  for (let i = 0; i < 14; i += 1) {
    const p = pavementPoint(rng, 0.1);
    marks.push({
      kind: "stain",
      tint: "soot",
      along: p.x,
      y: p.z,
      radiusM: rng.range(0.12, 0.38),
      strength: rng.range(0.55, 0.8),
    });
  }
  for (let i = 0; i < 160; i += 1) {
    const p = pavementPoint(rng, 0.1);
    marks.push({
      kind: "stain",
      tint: rng.next() < 0.75 ? "soot" : "salt",
      along: p.x,
      y: p.z,
      radiusM: rng.range(0.015, 0.035),
      strength: rng.range(0.55, 0.85),
    });
  }

  // Paler patched slabs, and dark broken holes where chunks have come out.
  for (let i = 0; i < 8; i += 1) {
    const p = pavementPoint(rng, 0.4);
    marks.push({
      kind: "chip",
      tint: "plaster",
      points: raggedPolygon(rng, p.x, p.z, rng.range(0.25, 0.55)),
      strength: rng.range(0.3, 0.45),
    });
  }
  for (let i = 0; i < 14; i += 1) {
    const p = pavementPoint(rng, 0.2);
    marks.push({
      kind: "chip",
      tint: "soot",
      points: raggedPolygon(rng, p.x, p.z, rng.range(0.08, 0.3)),
      strength: rng.range(0.6, 0.85),
    });
  }

  // Scuffs and scrape marks.
  for (let i = 0; i < 24; i += 1) {
    const p = pavementPoint(rng, 0.2);
    const angle = rng.range(0, Math.PI);
    const length = rng.range(0.2, 0.7);
    marks.push(
      line(
        "scratch",
        [
          [p.x, p.z],
          [p.x + Math.cos(angle) * length, p.z + Math.sin(angle) * length],
        ],
        rng.range(0.01, 0.025),
        rng.range(0.3, 0.55),
      ),
    );
  }

  marks.push(...joints());

  // Cracks: long wandering ones (a few walks joined end to end), some branching.
  for (let i = 0; i < 52; i += 1) {
    const p = pavementPoint(rng, 0.1);
    let dir = rng.range(0, Math.PI * 2);
    let at: readonly [number, number] = [p.x, p.z];
    const pieces = rng.int(1, 4);
    for (let j = 0; j < pieces; j += 1) {
      const piece = crack(rng, at[0], at[1], dir);
      if (piece.kind !== "crack") break;
      const points = onPavement(piece.points);
      if (points.length < 2) break;
      marks.push({ ...piece, points, widthM: piece.widthM * 0.7 });
      at = points[points.length - 1] ?? at;
      dir += rng.range(-0.8, 0.8);
      // Now and then a branch splits off.
      if (rng.next() < 0.3) {
        const branch = crack(rng, at[0], at[1], dir + rng.range(0.8, 1.6));
        const twig = branch.kind === "crack" ? onPavement(branch.points) : [];
        if (branch.kind === "crack" && twig.length >= 2)
          marks.push({ ...branch, points: twig, widthM: branch.widthM * 0.5 });
      }
    }
  }
  return marks;
}
