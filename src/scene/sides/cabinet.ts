import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
} from "three";
import { ATTRACT, promptVisible } from "@/logic/attract";
import { FONTS, fontStack } from "@/logic/assetManifest";
import { boxesGeometryData } from "@/logic/boxGeometry";
import {
  CABINET_TEXTURE,
  cabinetLayout,
  glowGeometryData,
} from "@/logic/cabinetLayout";
import { CABINET_LOOK } from "@/logic/lookConfig";
import { PALETTE } from "@/logic/palette";
import { CABINET_CREDIT, CABINET_MARQUEE, PRESS_START } from "@/ui/copy";
import { fitFont, glowText, toGeometry } from "./canvasText";

/** What the attract screen shows about the owner (from `src/content/`). */
export type AttractInfo = {
  readonly name: string;
  readonly title: string;
};

export type Cabinet = {
  readonly object: Group;
  setHighlighted(on: boolean): void;
  /** Runs attract mode (the blinking prompt); no blinking under reduced motion. */
  update(dtMs: number, reducedMotion: boolean): void;
  /** Draws the screen and marquee again, for example once the fonts have loaded. */
  redraw(): void;
  dispose(): void;
};

/** Marquee strip on top, attract screen below, scanlines over the screen. */
function drawFaces(
  ctx: CanvasRenderingContext2D,
  info: AttractInfo,
  showPrompt: boolean,
): void {
  const w = CABINET_TEXTURE.widthPx;
  const h = CABINET_TEXTURE.heightPx;
  // Canvas rows run top down, texture rows bottom up.
  const marqueeBottom = Math.round((1 - CABINET_TEXTURE.marquee.vMin) * h);
  const mono = fontStack(FONTS.mono, true);
  const neon = fontStack(FONTS.neon, true);

  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Marquee: a lit red panel with the label in white-hot neon.
  const lit = ctx.createLinearGradient(0, 0, 0, marqueeBottom);
  lit.addColorStop(0, "#3a0710");
  lit.addColorStop(0.5, "#5c0a17");
  lit.addColorStop(1, "#3a0710");
  ctx.fillStyle = lit;
  ctx.fillRect(0, 0, w, marqueeBottom);
  fitFont(ctx, CABINET_MARQUEE, neon, 72, w - 48);
  glowText(ctx, CABINET_MARQUEE, w / 2, marqueeBottom / 2, PALETTE.accent, 12);
  ctx.fillStyle = "#ffc2c8";
  ctx.fillText(CABINET_MARQUEE, w / 2, marqueeBottom / 2);

  // Screen: dark glass with a faint centre glow.
  const screenH = h - marqueeBottom;
  const glass = ctx.createRadialGradient(
    w / 2,
    marqueeBottom + screenH / 2,
    20,
    w / 2,
    marqueeBottom + screenH / 2,
    w * 0.7,
  );
  glass.addColorStop(0, "#14101a");
  glass.addColorStop(1, PALETTE.base);
  ctx.fillStyle = glass;
  ctx.fillRect(0, marqueeBottom, w, screenH);

  const row = (fraction: number): number => marqueeBottom + screenH * fraction;
  fitFont(ctx, info.name.toUpperCase(), mono, 44, w - 64);
  glowText(ctx, info.name.toUpperCase(), w / 2, row(0.2), PALETTE.amber, 10);
  fitFont(ctx, info.title.toUpperCase(), mono, 26, w - 64);
  glowText(ctx, info.title.toUpperCase(), w / 2, row(0.34), PALETTE.cyan, 6);
  if (showPrompt) {
    fitFont(ctx, PRESS_START, mono, 56, w - 64);
    glowText(ctx, PRESS_START, w / 2, row(0.6), PALETTE.accent, 16);
    ctx.fillStyle = "#ffe6e8";
    ctx.fillText(PRESS_START, w / 2, row(0.6));
  }
  fitFont(ctx, CABINET_CREDIT, mono, 22, w - 64);
  glowText(ctx, CABINET_CREDIT, w / 2, row(0.86), PALETTE.muted, 4);

  ctx.fillStyle = "rgb(0 0 0 / 35%)";
  for (let y = marqueeBottom; y < h; y += 4) ctx.fillRect(0, y, w, 2);
}

/**
 * The arcade cabinet on the front side: a merged body (one draw call) and its marquee and
 * attract screen (one quad pair sharing a canvas texture, one draw call). It fills the
 * front interaction spot and is picked as `spot-front`.
 */
export function createCabinet(
  info: AttractInfo,
  doc: Document = document,
): Cabinet {
  const layout = cabinetLayout();

  const bodyGeometry = toGeometry(boxesGeometryData(layout.parts, 1));
  const body = new MeshStandardMaterial({
    color: PALETTE.cabinet,
    roughness: CABINET_LOOK.bodyRoughness,
    metalness: CABINET_LOOK.bodyMetalness,
  });
  const bodyLit = body.clone();
  bodyLit.emissive.set(PALETTE.accent);
  bodyLit.emissiveIntensity = CABINET_LOOK.highlightEmissive;
  const bodyMesh = new Mesh(bodyGeometry, body);
  bodyMesh.name = "cabinet-body";

  const canvas = doc.createElement("canvas");
  canvas.width = CABINET_TEXTURE.widthPx;
  canvas.height = CABINET_TEXTURE.heightPx;
  const ctx = canvas.getContext("2d");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;

  const faceGeometry = toGeometry(glowGeometryData(layout.faces));
  const faceMaterial = new MeshBasicMaterial({ map: texture });
  faceMaterial.color.setScalar(CABINET_LOOK.faceIntensity);
  const faceMesh = new Mesh(faceGeometry, faceMaterial);
  faceMesh.name = "cabinet-faces";

  const group = new Group();
  group.name = layout.id;
  group.userData = { spotId: layout.id, side: layout.side };
  group.add(bodyMesh, faceMesh);

  let elapsedMs = 0;
  let showPrompt = true;
  const redraw = (): void => {
    if (ctx === null) return;
    drawFaces(ctx, info, showPrompt);
    texture.needsUpdate = true;
  };
  redraw();

  return {
    object: group,
    setHighlighted(on) {
      bodyMesh.material = on ? bodyLit : body;
    },
    update(dtMs, reducedMotion) {
      // Kept within one blink cycle, so it never grows without bound.
      elapsedMs = (elapsedMs + Math.max(0, dtMs)) % ATTRACT.blinkPeriodMs;
      const next = promptVisible(elapsedMs, reducedMotion);
      if (next === showPrompt) return;
      showPrompt = next;
      redraw();
    },
    redraw,
    dispose() {
      group.clear();
      bodyGeometry.dispose();
      body.dispose();
      bodyLit.dispose();
      faceGeometry.dispose();
      faceMaterial.dispose();
      texture.dispose();
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
