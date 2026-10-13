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
import {
  DETAIL_TEXTURE,
  detailGeometryData,
  detailLayout,
  type SignId,
} from "@/logic/detailLayout";
import type { PixelRect } from "@/logic/graffitiLayout";
import {
  DETAILS_LOOK,
  surfaceMaterialParams,
  type SurfaceMaterialParams,
} from "@/logic/lookConfig";
import { PALETTE } from "@/logic/palette";
import { fitFont, glowText } from "../sides/canvasText";

/** What the signs say: the rooftop shows the profile's name, the shop signs `content/signage`. */
export type SignTexts = Readonly<Record<SignId, string>>;

export type Details = {
  readonly object: Mesh;
  /** Puts the metal maps on the props, or keeps the plain colour if they're missing. */
  applyTextures(
    textures: Readonly<Record<TextureSlot, TextureSet<Texture>>>,
  ): void;
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
}

/**
 * Every detail prop (AC units, pipes, cables, vents, puddles, the shop signs and the
 * rooftop name sign) merged into one mesh: one draw call. The metal texture comes through
 * the first UV set; the sign text and the puddles' glow through the second, from one
 * 1024 x 512 canvas used as the emissive map. Not pickable.
 */
export function createDetails(
  texts: SignTexts,
  doc: Document = document,
): Details {
  const look = DETAILS_LOOK.surface;
  const data = detailGeometryData(
    detailLayout(),
    look.tileM,
    DETAILS_LOOK.shades,
  );
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(data.positions, 3),
  );
  geometry.setAttribute("normal", new Float32BufferAttribute(data.normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(data.uvs, 2));
  geometry.setAttribute("uv1", new Float32BufferAttribute(data.atlasUvs, 2));
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
    redraw,
    dispose() {
      // The metal maps belong to the asset loader, which disposes them.
      geometry.dispose();
      material.dispose();
      atlas.dispose();
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
