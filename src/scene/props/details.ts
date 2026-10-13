import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Texture,
} from "three";
import type { TextureSet } from "@/logic/assetFallback";
import { FONTS, fontStack, type TextureSlot } from "@/logic/assetManifest";
import type { Box } from "@/logic/buildingLayout";
import {
  DETAIL_TEXTURE,
  WINDOW_CELLS,
  centreUv,
  cornerUvs,
  detailGeometryData,
  detailLayout,
  glassVertexStarts,
  signPlateVertices,
  withSignPlates,
  type SignId,
  type WindowCellId,
} from "@/logic/detailLayout";
import type { PixelRect } from "@/logic/graffitiLayout";
import {
  DETAILS_LOOK,
  SIGNS_LOOK,
  surfaceMaterialParams,
  type SurfaceMaterialParams,
} from "@/logic/lookConfig";
import { FLICKER_CYCLE_MS } from "@/logic/neonFlicker";
import { PALETTE } from "@/logic/palette";
import {
  dimmedWindow,
  flickeringPanes,
  withWindows,
} from "@/logic/windowLayout";
import { PROP_GRIME } from "@/logic/grimeLayout";
import { detailWearAttributes } from "@/logic/wearLayout";
import { STICKER_TILE } from "@/logic/wearLayout";
import { addGrime, createPropGrime, createStickerTile } from "../grime";
import { fitFont, glowText } from "../sides/canvasText";
import { drawWindowCell } from "./windowCells";

/** What the signs say: the rooftop shows the profile's name, the shop signs `content/signage`. */
export type SignTexts = Readonly<Record<SignId, string>>;

export type Details = {
  readonly object: Mesh;
  /** Puts the metal maps on the props, or keeps the plain colour if they're missing. */
  applyTextures(
    textures: Readonly<Record<TextureSlot, TextureSet<Texture>>>,
  ): void;
  /** Gives the skill signs' plates their faint red hover glow, or takes it off. */
  setSignPlatesLit(on: boolean): void;
  /**
   * Runs the flickering windows (task 20): now and then one cuts out for a moment, never
   * more than 3 times a second; all steady under reduced motion.
   */
  update(dtMs: number, reducedMotion: boolean): void;
  /** Draws the signs again, for example once the fonts have loaded. */
  redraw(): void;
  dispose(): void;
};

/** One sign's text: a coloured neon glow with a pale hot core, fitted to its rectangle. */
function drawSign(
  ctx: CanvasRenderingContext2D,
  rect: PixelRect,
  text: string,
  color: string,
  family: string,
): void {
  const pad = Math.round(rect.height * 0.12);
  // A thin neon frame round the sign.
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, Math.round(rect.height * 0.035));
  ctx.shadowColor = color;
  ctx.shadowBlur = pad;
  ctx.strokeRect(
    rect.x + pad / 2,
    rect.y + pad / 2,
    rect.width - pad,
    rect.height - pad,
  );
  ctx.shadowBlur = 0;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  fitFont(
    ctx,
    text,
    family,
    Math.round(rect.height * 0.55),
    rect.width - 4 * pad,
  );
  glowText(ctx, text, cx, cy, color, pad * 1.5);
  ctx.strokeStyle = DETAILS_LOOK.signCore;
  ctx.lineWidth = Math.max(1.5, rect.height * 0.012);
  ctx.strokeText(text, cx, cy);
}

/** The puddles' patch: a soft red and cyan smear of reflected neon on black. */
function drawPuddle(ctx: CanvasRenderingContext2D, rect: PixelRect): void {
  const [red, cyan] = DETAILS_LOOK.puddleGlow;
  ctx.fillStyle = "#000000";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  const blob = (fx: number, color: string): void => {
    const x = rect.x + rect.width * fx;
    const y = rect.y + rect.height / 2;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, rect.height / 2);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "#000000");
    ctx.fillStyle = gradient;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  };
  ctx.globalCompositeOperation = "lighter";
  blob(0.35, red);
  blob(0.65, cyan);
  ctx.globalCompositeOperation = "source-over";
}

function drawAtlas(ctx: CanvasRenderingContext2D, texts: SignTexts): void {
  const { rects } = DETAIL_TEXTURE;
  // Black everywhere, so nothing but the signs and the puddles glows.
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, DETAIL_TEXTURE.widthPx, DETAIL_TEXTURE.heightPx);
  const neon = fontStack(FONTS.neon, true);
  for (const sign of ["rooftop", "cafe", "arcade"] as const)
    drawSign(
      ctx,
      rects[sign],
      texts[sign],
      PALETTE[DETAILS_LOOK.signColors[sign]],
      neon,
    );
  drawPuddle(ctx, rects.puddle);
  for (const [id, rect] of Object.entries(WINDOW_CELLS))
    drawWindowCell(ctx, id as WindowCellId, rect);
  // The sign plates' hover glow: red at the plates' old highlight strength once the
  // material's emissive intensity is applied (worked out in linear light).
  ctx.fillStyle = new Color(PALETTE.accent)
    .multiplyScalar(
      SIGNS_LOOK.highlightEmissive / DETAILS_LOOK.emissiveIntensity,
    )
    .getStyle();
  ctx.fillRect(
    rects.plateLit.x,
    rects.plateLit.y,
    rects.plateLit.width,
    rects.plateLit.height,
  );
}

/**
 * Every detail prop (AC units, pipes, cables, vents, puddles, the shop signs and the
 * rooftop name sign) merged into one mesh: one draw call. The metal texture comes through
 * the first UV set; the sign text and the puddles' glow through the second, from one
 * 1024 x 512 canvas used as the emissive map. Not pickable. The skill signs' backing
 * plates (`signPlates`) join it too (task 15); their hover glow swaps their atlas UVs to
 * a red patch, so it needs no second material. The windows and doors join it too (task 20):
 * frames, planks and doors as shaded boxes, and each pane a quad on its window cell of the
 * atlas (now 1024 x 1024); a flickering pane cuts out by pointing at the dark cell.
 */
export function createDetails(
  texts: SignTexts,
  signPlates: readonly Box[] = [],
  doc: Document = document,
): Details {
  const look = DETAILS_LOOK.surface;
  // Windows and doors join before the sign plates, which must stay last among the boxes.
  const layout = withSignPlates(withWindows(detailLayout()), signPlates);
  const paneStarts = glassVertexStarts(layout);
  const flickering = flickeringPanes(layout.glass);
  const plates = signPlateVertices(layout);
  const data = detailGeometryData(layout, look.tileM, DETAILS_LOOK.shades);
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(data.positions, 3),
  );
  geometry.setAttribute("normal", new Float32BufferAttribute(data.normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(data.uvs, 2));
  const atlasUvs = new Float32BufferAttribute(data.atlasUvs, 2);
  let platesLit = false;
  let flickerMs = 0;
  let cutOut: number | undefined;
  /** Points pane `index` (into `layout.glass`) at a window cell of the atlas. */
  const setPaneCell = (index: number, id: WindowCellId): void => {
    const start = paneStarts[index];
    if (start === undefined) return;
    cornerUvs(WINDOW_CELLS[id]).forEach(([u, v], corner) => {
      atlasUvs.setXY(start + corner, u, v);
    });
    atlasUvs.needsUpdate = true;
  };
  geometry.setAttribute("uv1", atlasUvs);
  geometry.setAttribute("color", new Float32BufferAttribute(data.colors, 3));
  geometry.setIndex(data.indices);
  geometry.computeBoundingSphere();

  const canvas = doc.createElement("canvas");
  canvas.width = DETAIL_TEXTURE.widthPx;
  canvas.height = DETAIL_TEXTURE.heightPx;
  const ctx = canvas.getContext("2d");
  const atlas = new CanvasTexture(canvas);
  atlas.colorSpace = SRGBColorSpace;
  atlas.anisotropy = 4;
  // The atlas is read through the second UV set, so the metal keeps the first.
  atlas.channel = 1;

  const material = new MeshStandardMaterial({
    vertexColors: true,
    emissive: new Color(1, 1, 1),
    emissiveMap: atlas,
    emissiveIntensity: DETAILS_LOOK.emissiveIntensity,
  });
  // Rust and wear (task 22): a repeating tile read through the metal's UVs, which are in
  // tiles of `look.tileM` metres, scaled to the grime tile's size.
  // Stickers and worn edges on the sign boxes, AC units and doors (task 22 review).
  const grime = createPropGrime(doc);
  const stickerTile = createStickerTile(doc);
  const wear = detailWearAttributes(layout, data.positions.length / 3);
  geometry.setAttribute("faceUv", new Float32BufferAttribute(wear.faceUvs, 2));
  geometry.setAttribute(
    "faceSize",
    new Float32BufferAttribute(wear.faceSizes, 2),
  );
  geometry.setAttribute(
    "sticker",
    new Float32BufferAttribute(wear.stickers, 1),
  );
  addGrime(material, {
    grime,
    source: { kind: "uv", scale: look.tileM / PROP_GRIME.tileM },
    wear: {
      stickers: stickerTile.texture,
      scale: look.tileM / STICKER_TILE.tileM,
    },
  });
  const apply = (params: SurfaceMaterialParams<Texture>): void => {
    material.color.set(params.color);
    material.map = params.map;
    material.normalMap = params.normalMap;
    material.roughnessMap = params.roughnessMap;
    material.roughness = params.roughness;
    material.metalness = params.metalness;
    material.envMapIntensity = params.envMapIntensity;
    material.needsUpdate = true;
  };
  apply(
    surfaceMaterialParams<Texture>(look, {
      color: null,
      normal: null,
      roughness: null,
    }),
  );

  const mesh = new Mesh(geometry, material);
  mesh.name = "details";

  const redraw = (): void => {
    if (ctx === null) return;
    drawAtlas(ctx, texts);
    atlas.needsUpdate = true;
  };
  redraw();

  return {
    object: mesh,
    applyTextures(textures) {
      apply(surfaceMaterialParams(look, textures[look.slot].maps));
    },
    setSignPlatesLit(on) {
      const [u, v] = centreUv(
        on ? DETAIL_TEXTURE.rects.plateLit : DETAIL_TEXTURE.rects.dark,
      );
      if (plates.count === 0 || on === platesLit) return;
      platesLit = on;
      for (let i = plates.start; i < plates.start + plates.count; i += 1)
        atlasUvs.setXY(i, u, v);
      atlasUvs.needsUpdate = true;
    },
    update(dtMs, reducedMotion) {
      // Kept within one flicker cycle, so it never grows without bound.
      flickerMs = (flickerMs + Math.max(0, dtMs)) % FLICKER_CYCLE_MS;
      const next = dimmedWindow(flickerMs, flickering.length, reducedMotion);
      if (next === cutOut) return;
      const restore = cutOut === undefined ? undefined : flickering[cutOut];
      const pane = restore === undefined ? undefined : layout.glass[restore];
      if (restore !== undefined && pane !== undefined)
        setPaneCell(restore, pane.cell);
      cutOut = next;
      const dim = next === undefined ? undefined : flickering[next];
      if (dim !== undefined) setPaneCell(dim, "dark");
    },
    redraw,
    dispose() {
      // The metal maps belong to the asset loader, which disposes them.
      geometry.dispose();
      material.dispose();
      atlas.dispose();
      grime.dispose();
      stickerTile.dispose();
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
