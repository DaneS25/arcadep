/**
 * The run-down pass (task 22): grime, water streaks, stains, cracks, chipped paint and rust
 * runs, generated in code so the building looks worn without any download, and layered
 * over the user's textures when they are there. Pure numbers; the scene draws them into
 * canvas textures (`scene/grime.ts`) that multiply the surfaces' colour.
 *
 * Two textures:
 * - The wall grime atlas: one cell per side, covering that side's walls and the trim on it
 *   (floor bands, roof edge, parapet), so marks sit where they belong: streaks under the
 *   bands, sills and parapet, rust runs under the AC units, vents and sign brackets.
 * - The prop grime tile: a small repeating patch of rust and wear on the detail props.
 *
 * Both store multipliers at half scale: a texel of 0.5 (128) leaves the surface as it is,
 * darker texels darken it and lighter ones (chipped paint) lighten it. The shader raises
 * the multiplier to `GRIME_LOOK.contrast` (`grimeMultiplier`), so the tints below are
 * before that curve.
 */

import type { GeometryData } from "./boxGeometry";
import {
  BUILDING,
  SIDES,
  WINDOW,
  buildingHeightM,
  floorLevels,
  sideNormal,
  sideOffsetM,
  sideTangent,
  sideWidthM,
  wallHeightM,
  wallOpenings,
  type Side,
  type Vec3,
} from "./buildingLayout";
import { detailLayout } from "./detailLayout";
import { withDucts } from "./ductLayout";
import { createRng, type Rng } from "./rng";

/** A colour multiplier in linear light: [1, 1, 1] leaves a surface as it is. */
export type Tint = readonly [number, number, number];

/**
 * The grime colours, strong enough to read in the dark scene. No yellow, amber or orange
 * (conventions): rust pushes the surface towards red-brown, under 15 degrees of hue. Chips lighten (bare plaster under the paint).
 */
export const GRIME_TINTS = {
  /** Rain run-off: a cool dark grey. */
  water: [0.24, 0.24, 0.29],
  /** Soot and road dirt. */
  soot: [0.18, 0.17, 0.2],
  /** Damp patches. */
  damp: [0.45, 0.44, 0.5],
  /** Rust runs from metal. */
  rust: [1.45, 0.7, 0.58],
  /** Cracks and gouges. */
  crack: [0.04, 0.04, 0.05],
  /** Chipped paint showing the paler plaster underneath. */
  chip: [1.6, 1.55, 1.6],
  /** Bare plaster where whole flakes of paint have come away. */
  plaster: [1.75, 1.7, 1.75],
  /** Chalky salt (efflorescence) and tide lines left by rising damp. */
  salt: [1.85, 1.85, 1.9],
  /** Scuffs and scratches through paint. */
  scratch: [1.7, 1.65, 1.72],
  /** Faces off the walls' cells (tops, undersides): a little dirtier than clean. */
  plain: [0.75, 0.75, 0.78],
} as const satisfies Readonly<Record<string, Tint>>;

export type TintId = keyof typeof GRIME_TINTS;

/** What runs down from a sill. */
const SILL_RUN_TINTS: readonly TintId[] = ["water", "salt", "salt", "rust"];

/**
 * How each kind of mark changes the surface's roughness (a multiplier, stored at half
 * scale in the roughness texture like the tints): wet runs and damp go glossy so they catch
 * the neon and the moon, soot, salt and bare plaster go matte.
 */
export const GRIME_ROUGHNESS: Readonly<Record<TintId, number>> = {
  water: 0.3,
  soot: 1.6,
  damp: 0.45,
  rust: 0.85,
  crack: 1.3,
  chip: 1.25,
  plaster: 1.5,
  salt: 1.7,
  scratch: 0.8,
  plain: 1,
};

/** Wall and trim marks, in metres on a side's wall: `along` to the right facing it, `y` up. */
export type GrimeMark =
  /** A run down the wall from `topY`, fading out over `lengthM` and narrowing a little. */
  | {
      readonly kind: "streak";
      readonly tint: TintId;
      readonly along: number;
      readonly topY: number;
      readonly lengthM: number;
      readonly widthM: number;
      readonly strength: number;
    }
  /** A soft round blotch, a little taller than wide. */
  | {
      readonly kind: "stain";
      readonly tint: TintId;
      readonly along: number;
      readonly y: number;
      readonly radiusM: number;
      readonly strength: number;
    }
  /** A thin wandering line. */
  | {
      readonly kind: "crack";
      readonly points: readonly (readonly [number, number])[];
      readonly widthM: number;
      readonly strength: number;
    }
  /** A soft line: a tide line left by rising damp, a scuff or a scratch. */
  | {
      readonly kind: "line";
      readonly tint: TintId;
      readonly points: readonly (readonly [number, number])[];
      readonly widthM: number;
      readonly strength: number;
    }
  /** A ragged patch: paler paint chipped off, or a dark gouge knocked out of the wall. */
  | {
      readonly kind: "chip";
      readonly tint: TintId;
      readonly points: readonly (readonly [number, number])[];
      readonly strength: number;
    };

export const GRIME_SEED = 0x67a1e22;

/**
 * The wall atlas: 2048 x 2048 (2K, see decisions.md, task 22), a 1024 px cell per side
 * covering 14 x 14 m (about 73 px a metre): `along` from -7 to 7 m and `y` from 0 to 14 m,
 * which holds every wall (12 or 10 m wide) and the parapet (13.8 m high).
 */
export const GRIME_TEXTURE = {
  widthPx: 2048,
  heightPx: 2048,
  cellPx: 1024,
  extentM: 14,
} as const;

/** Which cell of the atlas each side uses (column, row; row 0 at the top). */
const CELLS: Readonly<Record<Side, readonly [number, number]>> = {
  front: [0, 0],
  left: [1, 0],
  back: [0, 1],
  right: [1, 1],
};

/**
 * Where the `plain` patch sits: the left cell's far left strip, which no wall reaches
 * (the left side is only 10 m wide).
 */
export const PLAIN_PATCH = { side: "left", along: -6.6, y: 7 } as const;

/** How the wall atlas paints each side as a whole, under the marks. */
export const GRIME_LOOK = {
  /** Road dirt splashed up from the ground: soot at this strength at the foot, gone by `groundBandM`. */
  groundBandM: 1.3,
  groundStrength: 0.55,
  /** Weathering just under the parapet's top. */
  topBandM: 1.2,
  topStrength: 0.35,
  /**
   * The shader raises each texel's multiplier to this power, so a mark reads in the dark
   * scene: dirt darkens hard while the 8-bit texels keep their precision.
   */
  contrast: 3,
  /** A face counts as on a wall when it is this close to the wall's plane (bands stand 0.15 m out). */
  wallToleranceM: 0.6,
} as const;

/** Atlas pixels per metre. */
export function grimePxPerM(): number {
  return GRIME_TEXTURE.cellPx / GRIME_TEXTURE.extentM;
}

/** A point on a side's wall as atlas pixels (top-left origin), clamped to its cell. */
export function grimePixel(
  side: Side,
  along: number,
  y: number,
): { x: number; y: number } {
  const [col, row] = CELLS[side];
  const half = GRIME_TEXTURE.extentM / 2;
  const a = Math.min(half, Math.max(-half, along));
  const h = Math.min(GRIME_TEXTURE.extentM, Math.max(0, y));
  const s = grimePxPerM();
  return {
    x: col * GRIME_TEXTURE.cellPx + (a + half) * s,
    y: row * GRIME_TEXTURE.cellPx + (GRIME_TEXTURE.extentM - h) * s,
  };
}

/** A side's cell, in atlas pixels. */
export function grimeCell(side: Side): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const [col, row] = CELLS[side];
  const size = GRIME_TEXTURE.cellPx;
  return { x: col * size, y: row * size, width: size, height: size };
}

/** Atlas pixels to texture UVs (the canvas is flipped on upload, so `v` runs up). */
function pixelUv(p: { x: number; y: number }): [number, number] {
  return [p.x / GRIME_TEXTURE.widthPx, 1 - p.y / GRIME_TEXTURE.heightPx];
}

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** The side whose wall a vertical face with outward `normal` belongs to, if any. */
function sideFacing(normal: Vec3): Side | undefined {
  return SIDES.find((side) => dot(normal, sideNormal(side)) > 0.9);
}

/**
 * The wall atlas UV for one vertex of the walls or trim: faces on a side's wall map to its
 * cell by where they are; tops, undersides and anything off the walls (the parapets'
 * inner faces) get the `plain` patch.
 */
export function grimeUv(normal: Vec3, position: Vec3): [number, number] {
  const plain = pixelUv(
    grimePixel(PLAIN_PATCH.side, PLAIN_PATCH.along, PLAIN_PATCH.y),
  );
  const side = sideFacing(normal);
  if (side === undefined) return plain;
  const out = dot(position, sideNormal(side)) - sideOffsetM(side);
  if (Math.abs(out) > GRIME_LOOK.wallToleranceM) return plain;
  const along = dot(position, sideTangent(side));
  return pixelUv(grimePixel(side, along, position.y));
}

/** `grimeUv` for every vertex of merged box geometry, as a flat UV array. */
export function grimeUvs(data: GeometryData): number[] {
  const uvs: number[] = [];
  for (let i = 0; i < data.positions.length; i += 3) {
    const at = (a: readonly number[]): Vec3 => ({
      x: a[i] ?? 0,
      y: a[i + 1] ?? 0,
      z: a[i + 2] ?? 0,
    });
    uvs.push(...grimeUv(at(data.normals), at(data.positions)));
  }
  return uvs;
}

/** A wall-mounted metal prop's outline on its wall: rust runs start under it. */
export type RustSource = {
  readonly minAlong: number;
  readonly maxAlong: number;
  readonly bottomY: number;
};

/**
 * Where rust runs start on a side: under every metal part fixed to the wall (AC units,
 * vents, the alley's pipe run, the hanging signs' brackets and plates). Drain pipes reach
 * the ground and leave none; parts above the walls (the roof plant) or off them (the poles)
 * don't count. Parts of one prop collapse into one source.
 */
export function rustSources(side: Side): RustSource[] {
  const n = sideNormal(side);
  const t = sideTangent(side);
  const half = sideWidthM(side) / 2;
  const found: RustSource[] = [];
  // The ducts, flues and back door lamp (task 23) rust down the walls too.
  for (const part of withDucts(detailLayout()).boxes) {
    if (part.kind !== "metal" && part.kind !== "plate") continue;
    const { centre, size } = part.box;
    const hn = Math.abs(dot(size, n)) / 2;
    const ht = Math.abs(dot(size, t)) / 2;
    const inner = dot(centre, n) - hn - sideOffsetM(side);
    if (inner < -0.05 || inner > 1.2) continue;
    const along = dot(centre, t);
    if (Math.abs(along) - ht > half) continue;
    const bottomY = centre.y - size.y / 2;
    if (bottomY < 0.5 || bottomY > wallHeightM() || size.y > 3) continue;
    found.push({ minAlong: along - ht, maxAlong: along + ht, bottomY });
  }
  // Parts of one prop (an AC unit's body and brackets, a sign's plate and rods) are
  // close together: join them into one source spanning them all.
  const near = (a: RustSource, b: RustSource): boolean =>
    a.minAlong < b.maxAlong + 0.8 &&
    b.minAlong < a.maxAlong + 0.8 &&
    Math.abs(a.bottomY - b.bottomY) < 1.6;
  const kept: RustSource[] = [];
  for (const part of found) {
    let merged = part;
    for (let i = kept.length - 1; i >= 0; i -= 1) {
      const other = kept[i];
      if (other === undefined || !near(merged, other)) continue;
      merged = {
        minAlong: Math.min(merged.minAlong, other.minAlong),
        maxAlong: Math.max(merged.maxAlong, other.maxAlong),
        bottomY: Math.min(merged.bottomY, other.bottomY),
      };
      kept.splice(i, 1);
    }
    kept.push(merged);
  }
  return kept.sort((a, b) => a.minAlong - b.minAlong);
}

/** Heights water runs off: the underside of each floor band, and the parapet's top. */
export function runOffLines(): number[] {
  return [
    ...floorLevels()
      .slice(1)
      .map((level) => level.baseY - BUILDING.bandHeightM / 2),
    buildingHeightM(),
  ];
}

function streak(
  rng: Rng,
  tint: TintId,
  along: number,
  topY: number,
  length: readonly [number, number],
  width: readonly [number, number],
  strength: readonly [number, number],
): GrimeMark {
  return {
    kind: "streak",
    tint,
    along,
    topY,
    lengthM: rng.range(length[0], length[1]),
    widthM: rng.range(width[0], width[1]),
    strength: rng.range(strength[0], strength[1]),
  };
}

/** A wandering crack from a point, heading roughly `angleRad` (0 is right, π/2 is up). */
export function crack(
  rng: Rng,
  along: number,
  y: number,
  angleRad: number,
): GrimeMark {
  const points: [number, number][] = [[along, y]];
  let a = along;
  let h = y;
  let dir = angleRad;
  const steps = rng.int(6, 13);
  for (let i = 0; i < steps; i += 1) {
    dir += rng.range(-0.6, 0.6);
    const step = rng.range(0.07, 0.17);
    a += Math.cos(dir) * step;
    h += Math.sin(dir) * step;
    points.push([a, h]);
  }
  return {
    kind: "crack",
    points,
    widthM: rng.range(0.012, 0.03),
    strength: rng.range(0.6, 0.85),
  };
}

/** A ragged polygon round a centre: 6 to 9 corners at uneven radii. */
export function raggedPolygon(
  rng: Rng,
  along: number,
  y: number,
  radiusM: number,
): [number, number][] {
  const corners = rng.int(6, 10);
  const points: [number, number][] = [];
  for (let i = 0; i < corners; i += 1) {
    const angle = (i / corners) * 2 * Math.PI + rng.range(-0.25, 0.25);
    const r = radiusM * rng.range(0.45, 1);
    points.push([along + Math.cos(angle) * r, y + Math.sin(angle) * r * 0.75]);
  }
  return points;
}

/**
 * Every mark on one side's wall, from the same seed on every load. In drawing order:
 * damp stains first, then water streaks under the bands and parapet, streaks and stains
 * under the windows' sills, rust runs under the wall props, chipped paint and gouges,
 * and the cracks on top.
 */
export function grimeMarks(side: Side, seed = GRIME_SEED): GrimeMark[] {
  const rng = createRng(seed + SIDES.indexOf(side) * 7919);
  const half = sideWidthM(side) / 2;
  const top = wallHeightM();
  const marks: GrimeMark[] = [];

  // Damp and soot blotches.
  const stains = 7 + rng.int(0, 4);
  for (let i = 0; i < stains; i += 1)
    marks.push({
      kind: "stain",
      tint: rng.next() < 0.6 ? "damp" : "soot",
      along: rng.range(-half, half),
      y: rng.range(0.3, top),
      radiusM: rng.range(0.5, 2.2),
      strength: rng.range(0.3, 0.6),
    });

  // Rain off the floor bands and the parapet.
  for (const lineY of runOffLines()) {
    const count = Math.round(sideWidthM(side) * 0.9);
    const fromTop = lineY >= top;
    for (let i = 0; i < count; i += 1)
      marks.push(
        streak(
          rng,
          rng.next() < 0.25 ? "salt" : "water",
          rng.range(-half + 0.1, half - 0.1),
          lineY,
          fromTop ? [1.5, 4.5] : [0.8, 3.2],
          [0.12, 0.6],
          [0.55, 0.9],
        ),
      );
  }

  // Under each window's sill: two or three runs (dirty water, pale lime washed out of the
  // sill, or rust from its fixings) and a damp patch.
  for (const o of wallOpenings()) {
    if (o.side !== side || o.kind !== "window") continue;
    const sillY = o.bottomY - WINDOW.sillHeightM;
    const runs = rng.int(2, 4);
    for (let i = 0; i < runs; i += 1) {
      const edge = i === 0 ? -0.42 : i === 1 ? 0.42 : rng.range(-0.3, 0.3);
      marks.push(
        streak(
          rng,
          rng.pick(SILL_RUN_TINTS) ?? "water",
          o.alongM + edge * o.widthM,
          sillY,
          [0.8, 2.4],
          [0.1, 0.3],
          [0.7, 0.95],
        ),
      );
    }
    marks.push({
      kind: "stain",
      tint: "damp",
      along: o.alongM,
      y: sillY - 0.25,
      radiusM: o.widthM * 0.45,
      strength: rng.range(0.2, 0.35),
    });
  }

  // Rust runs under the wall props.
  for (const s of rustSources(side)) {
    const runs = Math.min(
      5,
      Math.max(2, Math.round((s.maxAlong - s.minAlong) * 1.5)),
    );
    for (let i = 0; i < runs; i += 1)
      marks.push(
        streak(
          rng,
          "rust",
          rng.range(s.minAlong + 0.05, s.maxAlong - 0.05),
          s.bottomY,
          [0.8, 2.5],
          [0.04, 0.18],
          [0.6, 0.9],
        ),
      );
  }

  // Chipped paint, and a few dark gouges knocked out of the wall.
  const chips = 18 + rng.int(0, 10);
  for (let i = 0; i < chips; i += 1) {
    const gouge = rng.next() < 0.2;
    marks.push({
      kind: "chip",
      tint: gouge ? "crack" : "chip",
      points: raggedPolygon(
        rng,
        rng.range(-half, half),
        rng.range(0.2, top),
        gouge ? rng.range(0.06, 0.18) : rng.range(0.05, 0.3),
      ),
      strength: gouge ? rng.range(0.6, 0.85) : rng.range(0.45, 0.75),
    });
  }

  // Flaked paint: bigger patches of bare plaster.
  const flakes = 5 + rng.int(0, 4);
  for (let i = 0; i < flakes; i += 1)
    marks.push({
      kind: "chip",
      tint: "plaster",
      points: raggedPolygon(
        rng,
        rng.range(-half + 0.3, half - 0.3),
        rng.range(0.4, top - 0.3),
        rng.range(0.25, 0.7),
      ),
      strength: rng.range(0.55, 0.8),
    });

  // Rising damp: chalky salt blooms low on the wall and under a few sills, and tide lines.
  const blooms = 5 + rng.int(0, 4);
  for (let i = 0; i < blooms; i += 1)
    marks.push({
      kind: "stain",
      tint: "salt",
      along: rng.range(-half, half),
      y: rng.range(0.3, 1.5),
      radiusM: rng.range(0.3, 0.9),
      strength: rng.range(0.35, 0.6),
    });
  for (const o of wallOpenings()) {
    if (o.side !== side || o.kind !== "window" || rng.next() < 0.5) continue;
    marks.push({
      kind: "stain",
      tint: "salt",
      along: o.alongM + rng.range(-0.3, 0.3) * o.widthM,
      y: o.bottomY - WINDOW.sillHeightM - rng.range(0.3, 0.7),
      radiusM: rng.range(0.2, 0.45),
      strength: rng.range(0.35, 0.55),
    });
  }
  const tides = 2 + rng.int(0, 2);
  for (let i = 0; i < tides; i += 1) {
    const length = rng.range(2, 5);
    const start = rng.range(-half, half - length);
    const baseY = rng.range(0.8, 1.4);
    const points: [number, number][] = [];
    for (let a = 0; a <= length + 1e-9; a += length / 12)
      points.push([start + a, baseY + rng.range(-0.08, 0.08)]);
    marks.push({
      kind: "line",
      tint: "salt",
      points,
      widthM: rng.range(0.04, 0.08),
      strength: rng.range(0.5, 0.75),
    });
  }

  // Scuffed paint on the trim: the floor bands' faces and the parapet's top edge.
  const trimLines = [
    ...floorLevels()
      .slice(1)
      .map((level) => level.baseY),
    buildingHeightM() - 0.35,
  ];
  for (const lineY of trimLines) {
    const scuffs = 6 + rng.int(0, 5);
    for (let i = 0; i < scuffs; i += 1)
      marks.push({
        kind: "chip",
        tint: "scratch",
        points: raggedPolygon(
          rng,
          rng.range(-half, half),
          lineY + rng.range(-0.1, 0.1),
          rng.range(0.05, 0.2),
        ),
        strength: rng.range(0.5, 0.8),
      });
  }

  // Cracks: some from the windows' corners, the rest anywhere.
  const windows = wallOpenings().filter(
    (o) => o.side === side && o.kind === "window",
  );
  const fromCorners = Math.min(windows.length, 3);
  for (let i = 0; i < fromCorners; i += 1) {
    const o = rng.pick(windows);
    if (o === undefined) break;
    const right = rng.next() < 0.5;
    const up = rng.next() < 0.5;
    const along = o.alongM + (right ? 0.5 : -0.5) * o.widthM;
    const y = up ? o.bottomY + o.heightM : o.bottomY - WINDOW.sillHeightM;
    const angle = (up ? 1 : -1) * (Math.PI / 2 - (right ? 0.6 : -0.6));
    marks.push(crack(rng, along, y, angle));
  }
  const loose = 2 + rng.int(0, 3);
  for (let i = 0; i < loose; i += 1)
    marks.push(
      crack(
        rng,
        rng.range(-half + 0.3, half - 0.3),
        rng.range(0.5, top - 0.5),
        rng.range(0, 2 * Math.PI),
      ),
    );

  return marks;
}

/** The prop grime tile: 512 px square, repeating every 2 m on the props' metal UVs. */
export const PROP_GRIME = {
  sizePx: 512,
  tileM: 2,
  seed: 0x2057ed,
} as const;

/**
 * The marks on the prop tile, in metres within the tile (`along` and `y` from 0 to
 * `tileM`). The scene draws each one wrapped round the edges, so the tile repeats without
 * a seam: rust spots with runs down from them, soot and chipped paint.
 */
export function propGrimeMarks(seed: number = PROP_GRIME.seed): GrimeMark[] {
  const rng = createRng(seed);
  const size = PROP_GRIME.tileM;
  const marks: GrimeMark[] = [];
  for (let i = 0; i < 10; i += 1)
    marks.push({
      kind: "stain",
      tint: rng.next() < 0.5 ? "soot" : "damp",
      along: rng.range(0, size),
      y: rng.range(0, size),
      radiusM: rng.range(0.1, 0.4),
      strength: rng.range(0.25, 0.5),
    });
  for (let i = 0; i < 12; i += 1) {
    const along = rng.range(0, size);
    const y = rng.range(0, size);
    marks.push({
      kind: "stain",
      tint: "rust",
      along,
      y,
      radiusM: rng.range(0.04, 0.14),
      strength: rng.range(0.55, 0.85),
    });
    marks.push(
      streak(rng, "rust", along, y, [0.2, 0.9], [0.02, 0.08], [0.4, 0.7]),
    );
  }
  // Scratches and scuffs through the paint.
  for (let i = 0; i < 16; i += 1) {
    const along = rng.range(0, size);
    const y = rng.range(0, size);
    const angle = rng.range(0, Math.PI);
    const length = rng.range(0.08, 0.45);
    const bend = rng.range(-0.04, 0.04);
    marks.push({
      kind: "line",
      tint: "scratch",
      points: [
        [along, y],
        [
          along + (Math.cos(angle) * length) / 2 + bend,
          y + (Math.sin(angle) * length) / 2 - bend,
        ],
        [along + Math.cos(angle) * length, y + Math.sin(angle) * length],
      ],
      widthM: rng.range(0.004, 0.012),
      strength: rng.range(0.5, 0.85),
    });
  }
  for (let i = 0; i < 14; i += 1)
    marks.push({
      kind: "chip",
      tint: "chip",
      points: raggedPolygon(
        rng,
        rng.range(0, size),
        rng.range(0, size),
        rng.range(0.02, 0.08),
      ),
      strength: rng.range(0.3, 0.5),
    });
  return marks;
}

/** What a tint finally multiplies a surface by, after the shader's contrast curve. */
export function grimeMultiplier(tint: Tint): Tint {
  const k = GRIME_LOOK.contrast;
  return [tint[0] ** k, tint[1] ** k, tint[2] ** k];
}

/** A tint's roughness multiplier as a canvas grey at half scale, with `alpha`. */
export function roughnessStyle(tint: TintId, alpha = 1): string {
  const r = GRIME_ROUGHNESS[tint];
  return tintStyle([r, r, r], alpha);
}

/** A tint as a canvas colour at half scale (128 is 1), with `alpha` for blending. */
export function tintStyle(tint: Tint, alpha = 1): string {
  const byte = (m: number): number =>
    Math.round(Math.min(1, Math.max(0, m / 2)) * 255);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${String(byte(tint[0]))}, ${String(byte(tint[1]))}, ${String(byte(tint[2]))}, ${String(a)})`;
}
