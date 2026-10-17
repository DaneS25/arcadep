/** The details atlas: its rectangles, the window cells and their texture coordinates (task 39 split). */

import type { PixelRect } from "./graffitiLayout";
import type {
  GlowColor,
  PatchFaceId,
  SignId,
  WindowCellId,
} from "./detailTypes";

/**
 * The atlas: 1024 x 1024 px (inside the 1K budget). The rooftop sign across the top, the
 * two shop signs side by side below it, then a black patch that every plain part samples
 * (so it never glows), a faint red patch the skill-sign plates switch to while the cluster
 * is hovered, and a dim neon-reflection patch for the puddles. The bottom half holds the
 * window cells (`WINDOW_CELLS`, task 20).
 */
export const DETAIL_TEXTURE = {
  widthPx: 1024,
  heightPx: 1024,
  rects: {
    rooftop: { x: 0, y: 0, width: 1024, height: 224 },
    cafe: { x: 0, y: 224, width: 512, height: 128 },
    arcade: { x: 512, y: 224, width: 512, height: 128 },
    dark: { x: 0, y: 384, width: 128, height: 128 },
    plateLit: { x: 128, y: 384, width: 128, height: 128 },
    puddle: { x: 256, y: 384, width: 256, height: 128 },
    /** The back door lamp's bulb (task 23). */
    lamp: { x: 512, y: 384, width: 128, height: 128 },
    /** The generator's warning stencil and its slits' cold glow (task 28). */
    stencil: { x: 640, y: 384, width: 128, height: 128 },
    glow: { x: 768, y: 384, width: 128, height: 128 },
    /** The overhead wires' faint sheen (task 29), so they catch the neon in the dark. */
    wireSheen: { x: 896, y: 384, width: 128, height: 128 },
    /** The wire taps' LEDs (task 33), in a free corner beside the window cells. */
    ledRed: { x: 384, y: 704, width: 64, height: 64 },
    ledCyan: { x: 448, y: 704, width: 64, height: 64 },
    ledPurple: { x: 512, y: 704, width: 64, height: 64 },
    /** The small lights (task 34): a cold bulb, a cold tube, and the exit sign's face. */
    lightBulb: { x: 576, y: 704, width: 64, height: 64 },
    lightTube: { x: 640, y: 704, width: 64, height: 64 },
    /** The street lamps' warm bulbs (task 40). */
    lightStreet: { x: 704, y: 704, width: 64, height: 64 },
    exit: { x: 384, y: 768, width: 256, height: 96 },
  },
} as const satisfies {
  widthPx: number;
  heightPx: number;
  rects: Record<
    | SignId
    | PatchFaceId
    | "dark"
    | "plateLit"
    | "puddle"
    | "lamp"
    | "glow"
    | "wireSheen"
    | "ledRed"
    | "ledCyan"
    | "ledPurple"
    | "lightBulb"
    | "lightTube"
    | "lightStreet",
    PixelRect
  >;
};

const cell = (col: number, row: number): PixelRect => ({
  x: col * 128,
  y: 512 + row * 192,
  width: 128,
  height: 192,
});

/** The window cells, 128 x 192 px each (about a window's shape), under the signs. */
export const WINDOW_CELLS: Readonly<Record<WindowCellId, PixelRect>> = {
  "lit-purple": cell(0, 0),
  "lit-red": cell(1, 0),
  "lit-cold": cell(2, 0),
  "blinds-purple": cell(3, 0),
  "blinds-red": cell(4, 0),
  "blinds-cold": cell(5, 0),
  "silhouette-purple": cell(6, 0),
  "silhouette-red": cell(7, 0),
  "silhouette-cold": cell(0, 1),
  dark: cell(1, 1),
  broken: cell(2, 1),
};

/** A pixel rectangle of the atlas as texture coordinates (v up, 0 at the bottom). */
export function detailUv(rect: PixelRect): {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
} {
  const t = DETAIL_TEXTURE;
  return {
    uMin: rect.x / t.widthPx,
    uMax: (rect.x + rect.width) / t.widthPx,
    vMin: 1 - (rect.y + rect.height) / t.heightPx,
    vMax: 1 - rect.y / t.heightPx,
  };
}

/** The atlas UV each glow colour samples (an LED's or a small light's lit patch). */
export function glowUvs(): Readonly<Record<GlowColor, [number, number]>> {
  const r = DETAIL_TEXTURE.rects;
  return {
    red: centreUv(r.ledRed),
    cyan: centreUv(r.ledCyan),
    purple: centreUv(r.ledPurple),
    bulb: centreUv(r.lightBulb),
    tube: centreUv(r.lightTube),
    street: centreUv(r.lightStreet),
  };
}

/** The atlas coordinates of a rectangle's corners: bottom-left, bottom-right, top-right, top-left. */
export function cornerUvs(rect: PixelRect): [number, number][] {
  const uv = detailUv(rect);
  return [
    [uv.uMin, uv.vMin],
    [uv.uMax, uv.vMin],
    [uv.uMax, uv.vMax],
    [uv.uMin, uv.vMax],
  ];
}

/** The atlas coordinates of a rectangle's centre. */
export function centreUv(rect: PixelRect): [number, number] {
  const uv = detailUv(rect);
  return [(uv.uMin + uv.uMax) / 2, (uv.vMin + uv.vMax) / 2];
}
