/**
 * Small flickering lights round the building (task 34), at least one a side: a failing
 * strip light over the front's big shop window, a bare bulb on a bracket over its red
 * window, a bare bulb over the right's lit ground-floor window, a buzzing exit sign over
 * the back's left-hand door, and a broken fragment of purple neon over the left's
 * ground-floor window. Dim, cold or palette colours (no yellow or amber), never blooming,
 * so the main signs still lead.
 *
 * Their flicker is the lights' share of the scene's one flash budget (`neonFlicker`): in a
 * slot the lights own, one flickering light cuts out for the slot's first 120 ms, and no
 * sign, window or tap flashes in that slot, so no view ever passes 3 flashes a second.
 * Steady under reduced motion.
 *
 * Everything joins the details mesh: housings as boxes, bulbs and tubes as boxes of the
 * `light` kind on their atlas patch, the exit sign's lettering as an atlas face. No draw
 * call. Pure numbers in metres.
 */

import {
  pointOnSide,
  sideNormal,
  type Side,
  type Vec3,
  type WallRect,
} from "./buildingLayout";
import {
  DETAIL_TEXTURE,
  VERTICES_PER_BOX,
  detailUv,
  faceVertexStarts,
  wallBox,
  type DetailBox,
  type DetailLayout,
  type GlowColor,
  type SignFace,
} from "./detailLayout";
import { flashing } from "./neonFlicker";

export type LightKind = "strip" | "bulb" | "exit" | "neon";

export type SmallLight = {
  readonly id: string;
  readonly kind: LightKind;
  readonly side: Side;
  /** Whether it flickers now and then (in the lights' share of the flash budget). */
  readonly flicker: boolean;
  /** Housing, backing, bracket and clips: plain metal. */
  readonly boxes: readonly DetailBox[];
  /** The parts that glow: bulbs and tubes, of the `light` kind. */
  readonly glows: readonly DetailBox[];
  /** The exit sign's lettering, on the atlas. */
  readonly face?: SignFace;
};

export const LIGHTS = {
  seed: 0x1b873593,
  /** The exit sign: a box over the door, its face a little smaller. */
  exit: { across: 0.42, up: 0.16, out: 0.03, faceAcross: 0.38, faceUp: 0.12 },
  bulbM: 0.07,
} as const;

const metal = (box: DetailBox["box"]): DetailBox => ({
  kind: "metal",
  noStickers: true,
  box,
});

const glowing = (
  box: DetailBox["box"],
  glow: GlowColor,
  flicker: boolean,
): DetailBox =>
  flicker
    ? { kind: "light", noStickers: true, box, glow, blink: true }
    : { kind: "light", noStickers: true, box, glow };

/** A failing fluorescent strip on a backing plate, flat on the wall. */
function strip(
  id: string,
  side: Side,
  alongM: number,
  bottomY: number,
  flicker: boolean,
): SmallLight {
  return {
    id,
    kind: "strip",
    side,
    flicker,
    boxes: [
      metal(
        wallBox(side, alongM, bottomY, { across: 1.1, up: 0.06, out: 0.03 }),
      ),
    ],
    glows: [
      glowing(
        wallBox(
          side,
          alongM,
          bottomY + 0.015,
          { across: 1, up: 0.03, out: 0.03 },
          0.03,
        ),
        "tube",
        flicker,
      ),
    ],
  };
}

/** A bare bulb hanging under a short bracket out from the wall. */
function bulb(
  id: string,
  side: Side,
  alongM: number,
  bracketY: number,
  flicker: boolean,
): SmallLight {
  const b = LIGHTS.bulbM;
  const out = 0.12;
  return {
    id,
    kind: "bulb",
    side,
    flicker,
    boxes: [
      metal(
        wallBox(side, alongM, bracketY, {
          across: 0.03,
          up: 0.03,
          out: out + 0.015,
        }),
      ),
    ],
    glows: [
      glowing(
        wallBox(
          side,
          alongM,
          bracketY - b,
          { across: b, up: b, out: b },
          out - b / 2,
        ),
        "bulb",
        flicker,
      ),
    ],
  };
}

/** The exit sign over a door: a box and its lettering on the front face. */
function exitSign(
  id: string,
  side: Side,
  alongM: number,
  bottomY: number,
  flicker: boolean,
): SmallLight {
  const E = LIGHTS.exit;
  const out = E.out + 0.002;
  const at = (da: number, up: number): Vec3 =>
    pointOnSide(side, alongM + da, bottomY + (E.up - E.faceUp) / 2 + up, out);
  const uv = detailUv(DETAIL_TEXTURE.rects.exit);
  const w = E.faceAcross / 2;
  return {
    id,
    kind: "exit",
    side,
    flicker,
    boxes: [
      metal(
        wallBox(side, alongM, bottomY, {
          across: E.across,
          up: E.up,
          out: E.out,
        }),
      ),
    ],
    glows: [],
    face: {
      sign: "exit",
      quad: {
        corners: [at(-w, 0), at(w, 0), at(w, E.faceUp), at(-w, E.faceUp)],
        normal: sideNormal(side),
        ...uv,
      },
    },
  };
}

/** A broken length of neon tube held by two clips, a little off the wall. */
function neonFragment(
  id: string,
  side: Side,
  alongM: number,
  y: number,
  flicker: boolean,
): SmallLight {
  const clip = (da: number): DetailBox =>
    metal(
      wallBox(side, alongM + da, y - 0.025, {
        across: 0.03,
        up: 0.05,
        out: 0.06,
      }),
    );
  return {
    id,
    kind: "neon",
    side,
    flicker,
    boxes: [clip(-0.18), clip(0.18)],
    glows: [
      glowing(
        wallBox(
          side,
          alongM,
          y - 0.0175,
          { across: 0.45, up: 0.035, out: 0.035 },
          0.06,
        ),
        "purple",
        flicker,
      ),
    ],
  };
}

/** The exit signs: placed apart from `smallLights`, so the graffiti can clear round them. */
const EXIT_SIGNS: readonly {
  id: string;
  side: Side;
  alongM: number;
  bottomY: number;
}[] = [{ id: "back-exit", side: "back", alongM: -4.75, bottomY: 2.6 }];

/** Every small light, at least one a side. */
export function smallLights(): SmallLight[] {
  return [
    // Front: over the big shop window (top 2.9 m), and over the red window by the door.
    strip("front-strip", "front", 2.6, 3.18, true),
    bulb("front-bulb", "front", -1.3, 3.22, false),
    // Right: over the lit ground-floor window.
    bulb("right-bulb", "right", 3.9, 3.22, true),
    // Back: over the left-hand back door (top 2.45 m); the caged lamp is over the other.
    ...EXIT_SIGNS.map((e) => exitSign(e.id, e.side, e.alongM, e.bottomY, true)),
    // Left: over the ground-floor window left of the generator.
    neonFragment("left-neon", "left", -3, 3.2, true),
  ];
}

/**
 * Where the back's graffiti is wiped clear so a light shows through it: the exit sign sits
 * flat on the wall (3 cm, behind the paint layer, so it blocks no view of a poster), and
 * the tags stop round it like they do round the windows' frames.
 */
export function paintClearRects(side: Side): WallRect[] {
  const E = LIGHTS.exit;
  return EXIT_SIGNS.filter((e) => e.side === side).map((e) => ({
    side,
    minAlong: e.alongM - E.across / 2 - 0.02,
    maxAlong: e.alongM + E.across / 2 + 0.02,
    minY: e.bottomY - 0.02,
    maxY: e.bottomY + E.up + 0.02,
  }));
}

/** The layout with the lights added: housings, then glowing parts, then exit faces. */
export function withLights(
  layout: DetailLayout,
  lights: readonly SmallLight[] = smallLights(),
): DetailLayout {
  return {
    ...layout,
    boxes: [
      ...layout.boxes,
      ...lights.flatMap((l) => l.boxes),
      ...lights.flatMap((l) => l.glows),
    ],
    faces: [
      ...layout.faces,
      ...lights.flatMap((l) => (l.face === undefined ? [] : [l.face])),
    ],
  };
}

/**
 * The vertices to switch for each flickering light, in `smallLights` order: the first vertex
 * of each of its glowing boxes, or of its face. Lights that hold steady are left out.
 */
export function flickeringLightVertices(
  layout: DetailLayout,
  lights: readonly SmallLight[] = smallLights(),
): { readonly boxStarts: number[]; readonly faceStart: number | undefined }[] {
  // Matched by value, so a fresh `smallLights()` finds the parts `withLights` added.
  const same = (a: unknown, b: unknown): boolean =>
    JSON.stringify(a) === JSON.stringify(b);
  const faceStarts = faceVertexStarts(layout);
  return lights
    .filter((l) => l.flicker)
    .map((l) => {
      const face = l.face;
      const faceIndex =
        face === undefined ? -1 : layout.faces.findIndex((f) => same(f, face));
      return {
        boxStarts: l.glows.flatMap((g) => {
          const i = layout.boxes.findIndex((b) => same(b, g));
          return i < 0 ? [] : [i * VERTICES_PER_BOX];
        }),
        faceStart: faceIndex < 0 ? undefined : faceStarts[faceIndex],
      };
    });
}

/**
 * Which of the `count` flickering lights is cut out `timeMs` into the pattern, or undefined
 * when all are lit: the lights' share of the scene's flash budget. Never under reduced
 * motion.
 */
export function cutOutLight(
  timeMs: number,
  count: number,
  reducedMotion: boolean,
): number | undefined {
  return flashing(timeMs, "lights", LIGHTS.seed, count, reducedMotion);
}
