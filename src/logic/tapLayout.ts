/**
 * Wire taps (task 33): a few suspicious devices hacked into the overhead wires (task 30's
 * catenary strands) and the generator (task 28). A spliced junction box with crocodile
 * clips on the front's first-floor wire, a taped-on box with status LEDs and a small
 * antenna on the front's top-floor wire, a modem dangling off the right's top-floor wire,
 * and a taped box clipped onto a generator feed. Small, so they read as a find up close.
 *
 * Each device sits on a point along its strand (`strandPoint`), so it moves with the wires.
 * Everything joins the details mesh as boxes and thin beams, so it costs no draw call. The
 * LEDs are boxes of the `led` kind, lit by their own atlas patch in the palette's red, cyan
 * or purple. Pure numbers in metres.
 *
 * Blinking: the taps' share of the scene's one flash budget (`neonFlicker`): in a slot the
 * taps own, one blinking LED goes dark for its first 200 ms, and no window, sign or light
 * flashes in that slot, so nothing in any view flashes more than 3 times a second together.
 * The generator's LEDs stay steady. Nothing blinks under reduced motion.
 */

import {
  pointOnSide,
  sideNormal,
  sideOffsetM,
  sideTangent,
  type Side,
  type Vec3,
} from "./buildingLayout";
import {
  VERTICES_PER_BOX,
  wallBox,
  type DetailBeam,
  type DetailBox,
  type DetailLayout,
  type GlowColor,
} from "./detailLayout";
import { housingTopY } from "./generatorLayout";
import { flashing } from "./neonFlicker";
import { wireStrands, type WireStrand } from "./wireLayout";

/** An LED: a tiny box of the `led` kind, glowing with its colour's atlas patch. */
export type TapLed = DetailBox & {
  readonly kind: "led";
  readonly glow: GlowColor;
};

export type TapDevice = {
  readonly id: string;
  /** The strand it's hacked into, if any (the generator's box sits on the housing). */
  readonly run: string | undefined;
  /** Where it holds on: its strand's point, or its spot on the generator. */
  readonly at: Vec3;
  readonly boxes: readonly DetailBox[];
  readonly beams: readonly DetailBeam[];
  readonly leds: readonly TapLed[];
};

export const TAPS = {
  /** An LED's size: a 2 cm cube. */
  ledM: 0.02,
  /** The crocodile clips' size, across the wire, up and out. */
  clip: { across: 0.05, up: 0.025, out: 0.03 },
  /** Leads and the antenna: thin wire. */
  leadM: 0.008,
  antennaM: 0.01,
  seed: 0x7a95b1e3,
} as const;

/** A strand of `run` (its first), by id. */
function strandOf(run: string, strands: readonly WireStrand[]): WireStrand {
  const strand = strands.find((s) => s.run === run);
  if (strand === undefined) throw new Error(`no wire run ${run}`);
  return strand;
}

/** The point `t` (0 to 1) of the way along a strand, by length. */
export function strandPoint(strand: WireStrand, t: number): Vec3 {
  const pts = strand.points;
  const lengths = pts.slice(1).map((p, i) => {
    const q = pts[i] ?? p;
    return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  });
  const total = lengths.reduce((a, b) => a + b, 0);
  let left = Math.min(1, Math.max(0, t)) * total;
  for (const [i, length] of lengths.entries()) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) break;
    if (left <= length || i === lengths.length - 1) {
      const k = length > 0 ? Math.min(1, left / length) : 0;
      return {
        x: a.x + (b.x - a.x) * k,
        y: a.y + (b.y - a.y) * k,
        z: a.z + (b.z - a.z) * k,
      };
    }
    left -= length;
  }
  return pts[0] ?? { x: 0, y: 0, z: 0 };
}

/** A world point as along, up and out on a side's wall. */
function onWall(
  side: Side,
  p: Vec3,
): { along: number; y: number; out: number } {
  const t = sideTangent(side);
  const n = sideNormal(side);
  return {
    along: p.x * t.x + p.z * t.z,
    y: p.y,
    out: p.x * n.x + p.z * n.z - sideOffsetM(side),
  };
}

/** A box on a side's wall centred on along, up, out. */
function centred(
  kind: DetailBox["kind"],
  side: Side,
  along: number,
  y: number,
  out: number,
  size: { across: number; up: number; out: number },
): DetailBox {
  return {
    kind,
    noStickers: true,
    box: wallBox(side, along, y - size.up / 2, size, out - size.out / 2),
  };
}

/** An LED on a box's front face (out), at along and up on the wall. */
function led(
  side: Side,
  along: number,
  y: number,
  frontOut: number,
  color: GlowColor,
  blink: boolean,
): TapLed {
  const s = TAPS.ledM;
  const { box } = centred("led", side, along, y, frontOut + s / 2, {
    across: s,
    up: s,
    out: s,
  });
  return blink
    ? { kind: "led", noStickers: true, box, glow: color, blink: true }
    : { kind: "led", noStickers: true, box, glow: color };
}

const beam = (from: Vec3, to: Vec3, thicknessM: number): DetailBeam => ({
  kind: "cable",
  from,
  to,
  thicknessM,
});

/** Two crocodile clips on the wire either side of `t`, each with a lead to `box`. */
function clips(
  side: Side,
  strand: WireStrand,
  ts: readonly number[],
  to: Vec3,
): { boxes: DetailBox[]; beams: DetailBeam[] } {
  const boxes: DetailBox[] = [];
  const beams: DetailBeam[] = [];
  for (const t of ts) {
    const p = strandPoint(strand, t);
    const w = onWall(side, p);
    boxes.push(centred("metal", side, w.along, w.y, w.out, TAPS.clip));
    beams.push(beam(p, to, TAPS.leadM));
  }
  return { boxes, beams };
}

/** A spliced junction box hung on the front's first-floor wire, clipped in both ways. */
function frontJunction(strands: readonly WireStrand[]): TapDevice {
  const side: Side = "front";
  const strand = strandOf("front-2", strands);
  const at = strandPoint(strand, 0.36);
  const w = onWall(side, at);
  const size = { across: 0.16, up: 0.12, out: 0.07 };
  // Hangs just under the wire, its back near the wall side of it.
  const y = w.y - 0.09;
  const front = w.out + size.out / 2;
  const box = centred("metal", side, w.along, y, w.out, size);
  const tied = clips(
    side,
    strand,
    [0.34, 0.38],
    pointOnSide(side, w.along, y + size.up / 2, w.out),
  );
  return {
    id: "front-junction",
    run: strand.run,
    at,
    boxes: [box, ...tied.boxes],
    beams: tied.beams,
    leds: [
      led(side, w.along - 0.04, y + 0.02, front, "cyan", false),
      led(side, w.along + 0.04, y + 0.02, front, "red", true),
    ],
  };
}

/** A box taped onto the front's top-floor wire, with status LEDs and a small antenna. */
function frontTaped(strands: readonly WireStrand[]): TapDevice {
  const side: Side = "front";
  const strand = strandOf("front-3", strands);
  const at = strandPoint(strand, 0.62);
  const w = onWall(side, at);
  const size = { across: 0.2, up: 0.09, out: 0.05 };
  const front = w.out + size.out / 2;
  const box = centred("metal", side, w.along, w.y, w.out, size);
  // Two strips of tape round box and wire.
  const tape = [-0.06, 0.06].map((d) =>
    centred("plate", side, w.along + d, w.y, w.out, {
      across: 0.025,
      up: size.up + 0.01,
      out: size.out + 0.01,
    }),
  );
  const antennaFoot = pointOnSide(
    side,
    w.along + 0.08,
    w.y + size.up / 2,
    w.out,
  );
  const antennaTip = pointOnSide(side, w.along + 0.11, w.y + 0.33, w.out);
  return {
    id: "front-taped",
    run: strand.run,
    at,
    boxes: [box, ...tape],
    beams: [beam(antennaFoot, antennaTip, TAPS.antennaM)],
    leds: [
      led(side, w.along - 0.03, w.y, front + 0.005, "red", true),
      led(side, w.along, w.y, front + 0.005, "purple", false),
      led(side, w.along + 0.03, w.y, front + 0.005, "cyan", true),
    ],
  };
}

/** A modem hanging on its lead off the right's top-floor wire, against the wall. */
function rightModem(strands: readonly WireStrand[]): TapDevice {
  const side: Side = "right";
  const strand = strandOf("right-3", strands);
  const at = strandPoint(strand, 0.42);
  const w = onWall(side, at);
  const size = { across: 0.2, up: 0.14, out: 0.035 };
  const drop = 0.35;
  const y = w.y - drop - size.up / 2;
  // Resting against the wall under the wire.
  const out = 0.03 + size.out / 2;
  const box = centred("metal", side, w.along, y, out, size);
  const front = out + size.out / 2;
  const tied = clips(
    side,
    strand,
    [0.42],
    pointOnSide(side, w.along, y + size.up / 2, out),
  );
  return {
    id: "right-modem",
    run: strand.run,
    at,
    boxes: [box, ...tied.boxes],
    beams: tied.beams,
    leds: [
      led(side, w.along - 0.05, y + 0.04, front, "cyan", true),
      led(side, w.along - 0.02, y + 0.04, front, "cyan", false),
    ],
  };
}

/**
 * A box taped onto the generator's housing between the drum and port 4, clipped onto
 * feed 4 just above its port, with a steady LED and an antenna.
 */
function generatorTap(strands: readonly WireStrand[]): TapDevice {
  const side: Side = "left";
  const strand = strandOf("feed-4", strands);
  const top = housingTopY();
  const size = { across: 0.16, up: 0.08, out: 0.22 };
  const along = 2.42;
  const outFrom = 0.62;
  const box: DetailBox = {
    kind: "metal",
    noStickers: true,
    box: wallBox(side, along, top, size, outFrom),
  };
  // Round the box and over its top, standing on the housing.
  const tape = centred(
    "plate",
    side,
    along,
    top + (size.up + 0.005) / 2,
    outFrom + size.out / 2,
    { across: size.across + 0.01, up: size.up + 0.005, out: 0.025 },
  );
  const at = pointOnSide(side, along, top + size.up, outFrom + size.out / 2);
  const tied = clips(side, strand, [0.012], at);
  const antennaFoot = pointOnSide(
    side,
    along - 0.05,
    top + size.up,
    outFrom + 0.05,
  );
  const antennaTip = pointOnSide(
    side,
    along - 0.07,
    top + size.up + 0.3,
    outFrom + 0.04,
  );
  const ledAt = onWall(side, at);
  return {
    id: "generator-tap",
    run: strand.run,
    at,
    boxes: [box, tape, ...tied.boxes],
    beams: [...tied.beams, beam(antennaFoot, antennaTip, TAPS.antennaM)],
    leds: [
      {
        kind: "led",
        noStickers: true,
        glow: "purple",
        box: wallBox(
          side,
          along + 0.04,
          top + size.up,
          { across: TAPS.ledM, up: TAPS.ledM, out: TAPS.ledM },
          ledAt.out - TAPS.ledM / 2,
        ),
      },
    ],
  };
}

/** Every tap device. */
export function tapDevices(
  strands: readonly WireStrand[] = wireStrands(),
): TapDevice[] {
  return [
    frontJunction(strands),
    frontTaped(strands),
    rightModem(strands),
    generatorTap(strands),
  ];
}

/** Every LED of the taps, in order: the order `withTaps` adds their boxes in. */
export function tapLeds(
  devices: readonly TapDevice[] = tapDevices(),
): TapLed[] {
  return devices.flatMap((d) => d.leds);
}

/** The layout with the taps added: their boxes, then their LEDs, after the layout's. */
export function withTaps(
  layout: DetailLayout,
  devices: readonly TapDevice[] = tapDevices(),
): DetailLayout {
  return {
    ...layout,
    boxes: [
      ...layout.boxes,
      ...devices.flatMap((d) => d.boxes),
      ...tapLeds(devices),
    ],
    beams: [...layout.beams, ...devices.flatMap((d) => d.beams)],
  };
}

/** The first vertex of each blinking LED in `detailGeometryData`'s output (boxes come first). */
export function blinkingLedStarts(layout: DetailLayout): number[] {
  return layout.boxes.flatMap((part, i) =>
    part.kind === "led" && part.blink === true ? [i * VERTICES_PER_BOX] : [],
  );
}

/**
 * Which of the `count` blinking LEDs is dark `timeMs` into the pattern, or undefined when
 * all are lit: the taps' share of the scene's flash budget (`neonFlicker`), so they never
 * flash at once with the windows, signs or lights. Never under reduced motion.
 */
export function darkLed(
  timeMs: number,
  count: number,
  reducedMotion: boolean,
): number | undefined {
  return flashing(timeMs, "taps", TAPS.seed, count, reducedMotion);
}
