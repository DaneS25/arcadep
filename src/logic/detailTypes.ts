/** The detail pass's shared types (split out of `detailLayout.ts`, task 39). */

import type { Box, Vec3 } from "./buildingLayout";
import type { AtlasQuad } from "./graffitiLayout";

/** What a part is made of, which sets its shade and how it samples the atlas. */
export type DetailKind =
  | "metal"
  | "plate"
  | "cable"
  | "puddle"
  | "face"
  /** The left side's skill-sign backing plates (task 15), merged in to save a draw call. */
  | "signPlate"
  /** Window and door frames and sills (task 20). */
  | "frame"
  /** Planks nailed over a window. */
  | "board"
  /** A door leaf. */
  | "door"
  /** A lamp's bulb (task 23): glows evenly with the atlas's lamp patch. */
  | "lamp"
  /** The generator's slits of cold light (task 28): glow evenly with the atlas's glow patch. */
  | "glow"
  /** The overhead wires (task 29): a shade lighter than the old cables, so they read at night. */
  | "wire"
  /** A wire tap's status LED (task 33): glows with its colour's atlas patch. */
  | "led"
  /** A small light's bulb or tube (task 34): glows with its colour's atlas patch. */
  | "light";

/**
 * What a glowing box (an LED or a small light) glows with: the palette's red, cyan or
 * purple (the taps' LEDs, task 33), or a small light's cold bulb or cold tube (task 34).
 */
export type GlowColor = "red" | "cyan" | "purple" | "bulb" | "tube";

export type DetailBox = {
  readonly kind: DetailKind;
  readonly box: Box;
  /** Keeps stickers off a box whose kind would get them (the generator, task 28 review). */
  readonly noStickers?: boolean;
  /** What an LED or a small light glows with (`led` and `light` kinds only). */
  readonly glow?: GlowColor;
  /** An LED or light that flickers (tasks 33 and 34): the scene swaps its atlas patch. */
  readonly blink?: true;
};

/** A thin square bar between two points, for cables and braces that don't run along an axis. */
export type DetailBeam = {
  readonly kind: DetailKind;
  readonly from: Vec3;
  readonly to: Vec3;
  readonly thicknessM: number;
};

export type SignId = "rooftop" | "cafe" | "arcade";

/** A quad of the atlas that isn't a sign: the generator's warning stencils (task 28), the back's exit sign (task 34). */
export type PatchFaceId = "stencil" | "exit";

/** A sign's glowing face (or a stencil), mapped to its own rectangle of the atlas. */
export type SignFace = {
  readonly sign: SignId | PatchFaceId;
  readonly quad: AtlasQuad;
};

/** A window's (or the shop door's) glass, mapped to its cell of the atlas (task 20). */
export type WindowGlass = {
  readonly cell: WindowCellId;
  /** Whether this pane's light now and then cuts out. */
  readonly flicker: boolean;
  readonly quad: AtlasQuad;
};

export type DetailLayout = {
  readonly boxes: readonly DetailBox[];
  readonly beams: readonly DetailBeam[];
  readonly faces: readonly SignFace[];
  /** Window glass, drawn after the faces (`withWindows`). */
  readonly glass: readonly WindowGlass[];
};

/** A window cell of the atlas: one look of lit, shaded, dark or broken glass. */
export type WindowCellId =
  | "lit-purple"
  | "lit-red"
  | "lit-cold"
  | "blinds-purple"
  | "blinds-red"
  | "blinds-cold"
  | "silhouette-purple"
  | "silhouette-red"
  | "silhouette-cold"
  | "dark"
  | "broken";
