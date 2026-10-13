import {
  CanvasTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
} from "three";
import { FONTS, fontStack } from "@/logic/assetManifest";
import { TERMINAL_LOOK } from "@/logic/lookConfig";
import { PALETTE } from "@/logic/palette";
import {
  TERMINAL_TEXTURE,
  terminalGeometryData,
  terminalLayout,
} from "@/logic/terminalLayout";
import { TERMINAL_SCREEN_LABEL, TERMINAL_SCREEN_PROMPT } from "@/ui/copy";
import { fitFont, glowText, toGeometry } from "./canvasText";

export type DoorTerminal = {
  readonly object: Group;
  setHighlighted(on: boolean): void;
  /** Draws the screen again, for example once the fonts have loaded. */
  redraw(): void;
  dispose(): void;
};

/** Screen on top (prompt and label over dark glass), keypad below, housing colour round them. */
function drawFaces(ctx: CanvasRenderingContext2D): void {
  const w = TERMINAL_TEXTURE.widthPx;
  const h = TERMINAL_TEXTURE.heightPx;
  // Canvas rows run top down, texture rows bottom up.
  const screenBottom = Math.round((1 - TERMINAL_TEXTURE.screen.vMin) * h);
  const mono = fontStack(FONTS.mono, true);

  ctx.fillStyle = PALETTE.terminal;
  ctx.fillRect(0, 0, w, h);

  // Screen: dark glass inside a thin cyan bezel.
  const pad = 10;
  ctx.fillStyle = PALETTE.base;
  ctx.fillRect(pad, pad, w - 2 * pad, screenBottom - 2 * pad);
  ctx.strokeStyle = PALETTE.cyan;
  ctx.lineWidth = 2;
  ctx.strokeRect(pad, pad, w - 2 * pad, screenBottom - 2 * pad);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitFont(ctx, TERMINAL_SCREEN_LABEL, mono, 26, w - 4 * pad);
  glowText(
    ctx,
    TERMINAL_SCREEN_LABEL,
    w / 2,
    screenBottom * 0.32,
    PALETTE.violet,
    6,
  );
  fitFont(ctx, TERMINAL_SCREEN_PROMPT, mono, 34, w - 4 * pad);
  glowText(
    ctx,
    TERMINAL_SCREEN_PROMPT,
    w / 2,
    screenBottom * 0.62,
    PALETTE.cyan,
    10,
  );
  ctx.fillStyle = "rgb(0 0 0 / 35%)";
  for (let y = pad; y < screenBottom - pad; y += 4)
    ctx.fillRect(pad, y, w - 2 * pad, 2);

  // Keypad: a 4 x 3 grid of dim keys and a red status light; the bottom rows stay plain
  // housing, where the housing's own UVs sample.
  const keypadTop = screenBottom + 8;
  const keyW = 44;
  const keyH = 22;
  const gap = 8;
  const left = (w - (4 * keyW + 3 * gap)) / 2;
  ctx.fillStyle = PALETTE.trim;
  for (let row = 0; row < 3; row += 1)
    for (let col = 0; col < 4; col += 1)
      ctx.fillRect(
        left + col * (keyW + gap),
        keypadTop + row * (keyH + gap),
        keyW,
        keyH,
      );
  ctx.fillStyle = PALETTE.accent;
  ctx.shadowColor = PALETTE.accent;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(w - 16, keypadTop + 8, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

/**
 * The door terminal on the right side, with the side door beside it: housing, door,
 * screen and keypad merged into one mesh (one draw call), its colour and glow from one
 * small canvas. Picked as `spot-right`; the highlight brightens the screen.
 */
export function createDoorTerminal(doc: Document = document): DoorTerminal {
  const layout = terminalLayout();
  const geometry = toGeometry(terminalGeometryData(layout));

  const canvas = doc.createElement("canvas");
  canvas.width = TERMINAL_TEXTURE.widthPx;
  canvas.height = TERMINAL_TEXTURE.heightPx;
  const ctx = canvas.getContext("2d");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;

  const material = new MeshStandardMaterial({
    map: texture,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: TERMINAL_LOOK.emissiveIntensity,
    roughness: TERMINAL_LOOK.roughness,
    metalness: TERMINAL_LOOK.metalness,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = "door-terminal";

  const group = new Group();
  group.name = layout.id;
  group.userData = { spotId: layout.id, side: layout.side };
  group.add(mesh);

  const redraw = (): void => {
    if (ctx === null) return;
    drawFaces(ctx);
    texture.needsUpdate = true;
  };
  redraw();

  return {
    object: group,
    setHighlighted(on) {
      material.emissiveIntensity = on
        ? TERMINAL_LOOK.litEmissiveIntensity
        : TERMINAL_LOOK.emissiveIntensity;
    },
    redraw,
    dispose() {
      group.clear();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
