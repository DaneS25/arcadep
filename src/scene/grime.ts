import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
  type MeshStandardMaterial,
  type Texture,
} from "three";
import { SIDES, buildingHeightM, type Side } from "@/logic/buildingLayout";
import {
  GRIME_LOOK,
  GRIME_TEXTURE,
  PLAIN_PATCH,
  PROP_GRIME,
  grimeCell,
  grimeMarks,
  grimePixel,
  grimePxPerM,
  propGrimeMarks,
  roughnessStyle,
  tintStyle,
  GRIME_TINTS,
  type GrimeMark,
  type TintId,
} from "@/logic/grimeLayout";
import {
  SIDEWALK_GRIME,
  sidewalkGrimeMarks,
  sidewalkPixel,
  sidewalkPxPerM,
} from "@/logic/sidewalkLayout";
import { STICKER_TILE, WEAR, stickers, type Sticker } from "@/logic/wearLayout";

/** Maps a mark's metres (along, up) to canvas pixels. */
type ToPixel = (along: number, y: number) => { x: number; y: number };

/**
 * What a mark is painted with: its colour multiplier for the grime texture, or its
 * roughness multiplier for the roughness texture (both at half scale).
 */
type Style = (tint: TintId, alpha: number) => string;

const colourStyle: Style = (tint, alpha) => tintStyle(GRIME_TINTS[tint], alpha);

function tracePath(
  ctx: CanvasRenderingContext2D,
  points: readonly (readonly [number, number])[],
  toPixel: ToPixel,
): void {
  ctx.beginPath();
  points.forEach(([a, y], i) => {
    const p = toPixel(a, y);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
}

/** Draws one mark through `toPixel`, `pxPerM` canvas pixels to a metre. */
function drawMark(
  ctx: CanvasRenderingContext2D,
  mark: GrimeMark,
  toPixel: ToPixel,
  pxPerM: number,
  style: Style,
): void {
  switch (mark.kind) {
    case "streak": {
      const top = toPixel(mark.along, mark.topY);
      const length = mark.lengthM * pxPerM;
      const w = Math.max(1, mark.widthM * pxPerM);
      const gradient = ctx.createLinearGradient(0, top.y, 0, top.y + length);
      gradient.addColorStop(0, style(mark.tint, mark.strength));
      gradient.addColorStop(0.35, style(mark.tint, mark.strength * 0.7));
      gradient.addColorStop(1, style(mark.tint, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(top.x - w / 2, top.y);
      ctx.lineTo(top.x + w / 2, top.y);
      ctx.lineTo(top.x + w * 0.2, top.y + length);
      ctx.lineTo(top.x - w * 0.2, top.y + length);
      ctx.closePath();
      ctx.fill();
      return;
    }
    case "stain": {
      const c = toPixel(mark.along, mark.y);
      const r = Math.max(1, mark.radiusM * pxPerM);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(1, 1.3);
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      gradient.addColorStop(0, style(mark.tint, mark.strength));
      gradient.addColorStop(1, style(mark.tint, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(-r, -r, 2 * r, 2 * r);
      ctx.restore();
      return;
    }
    case "crack":
    case "line": {
      const tint = mark.kind === "crack" ? "crack" : mark.tint;
      ctx.strokeStyle = style(tint, mark.strength);
      ctx.lineWidth = Math.max(1, mark.widthM * pxPerM);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      tracePath(ctx, mark.points, toPixel);
      ctx.stroke();
      return;
    }
    case "chip": {
      tracePath(ctx, mark.points, toPixel);
      ctx.closePath();
      ctx.fillStyle = style(mark.tint, mark.strength);
      ctx.fill();
      // A dark broken edge round the chip.
      ctx.strokeStyle = style("crack", mark.strength * 0.6);
      ctx.lineWidth = 1;
      ctx.stroke();
      return;
    }
  }
}

/** One side's cell: neutral, road dirt at the foot, weathering under the parapet, then the marks. */
function drawSide(
  ctx: CanvasRenderingContext2D,
  side: Side,
  style: Style,
): void {
  const cell = grimeCell(side);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cell.x, cell.y, cell.width, cell.height);
  ctx.clip();
  ctx.fillStyle = tintStyle([1, 1, 1]);
  ctx.fillRect(cell.x, cell.y, cell.width, cell.height);

  const foot = grimePixel(side, 0, 0).y;
  const band = grimePixel(side, 0, GRIME_LOOK.groundBandM).y;
  const ground = ctx.createLinearGradient(0, foot, 0, band);
  ground.addColorStop(0, style("soot", GRIME_LOOK.groundStrength));
  ground.addColorStop(1, style("soot", 0));
  ctx.fillStyle = ground;
  ctx.fillRect(cell.x, band, cell.width, foot - band);

  const roof = grimePixel(side, 0, buildingHeightM()).y;
  const under = grimePixel(side, 0, buildingHeightM() - GRIME_LOOK.topBandM).y;
  const top = ctx.createLinearGradient(0, roof, 0, under);
  top.addColorStop(0, style("water", GRIME_LOOK.topStrength));
  top.addColorStop(1, style("water", 0));
  ctx.fillStyle = top;
  ctx.fillRect(cell.x, roof, cell.width, under - roof);

  const toPixel: ToPixel = (along, y) => grimePixel(side, along, y);
  for (const mark of grimeMarks(side))
    drawMark(ctx, mark, toPixel, grimePxPerM(), style);
  ctx.restore();
}

function drawWallAtlas(ctx: CanvasRenderingContext2D, style: Style): void {
  for (const side of SIDES) drawSide(ctx, side, style);
  // The plain patch for tops, undersides and faces off the walls, drawn over its spare strip.
  const p = grimePixel(PLAIN_PATCH.side, PLAIN_PATCH.along, PLAIN_PATCH.y);
  ctx.fillStyle = style("plain", 1);
  ctx.fillRect(p.x - 24, p.y - 400, 48, 800);
}

/** Calls `draw` nine times, shifted by a tile each way, so marks wrap round the edges. */
function wrapped(
  size: number,
  tileM: number,
  draw: (toPixel: ToPixel) => void,
): void {
  const pxPerM = size / tileM;
  for (const dx of [-size, 0, size])
    for (const dy of [-size, 0, size])
      draw((along, y) => ({
        x: along * pxPerM + dx,
        y: (tileM - y) * pxPerM + dy,
      }));
}

function drawPropTile(
  ctx: CanvasRenderingContext2D,
  size: number,
  style: Style,
): void {
  ctx.fillStyle = tintStyle([1, 1, 1]);
  ctx.fillRect(0, 0, size, size);
  const marks = propGrimeMarks();
  const pxPerM = size / PROP_GRIME.tileM;
  wrapped(size, PROP_GRIME.tileM, (toPixel) => {
    for (const mark of marks) drawMark(ctx, mark, toPixel, pxPerM, style);
  });
}

/** One sticker: paper with a printed stripe or ring, a torn corner, faded. */
function drawSticker(
  ctx: CanvasRenderingContext2D,
  sticker: Sticker,
  toPixel: ToPixel,
  pxPerM: number,
): void {
  const c = toPixel(sticker.along, sticker.y);
  const w = sticker.widthM * pxPerM;
  const h = sticker.heightM * pxPerM;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(sticker.angleRad);
  ctx.globalAlpha = sticker.opacity;
  ctx.beginPath();
  if (sticker.shape === "round") {
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else {
    // A rectangle with its top-right corner torn off.
    const tear = sticker.torn * Math.min(w, h);
    ctx.moveTo(-w / 2, -h / 2);
    ctx.lineTo(w / 2 - tear, -h / 2);
    ctx.lineTo(w / 2, -h / 2 + tear);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
  }
  ctx.fillStyle = sticker.paper;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = sticker.ink;
  ctx.strokeStyle = sticker.ink;
  if (sticker.shape === "round") {
    ctx.lineWidth = Math.max(2, h * 0.12);
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.3, h * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.fillRect(-w / 2, -h * 0.12, w, h * 0.24);
    ctx.fillRect(-w * 0.4, h * 0.22, w * 0.5, Math.max(1, h * 0.08));
  }
  ctx.restore();
}

function drawStickerTile(ctx: CanvasRenderingContext2D): void {
  const size = STICKER_TILE.sizePx;
  ctx.clearRect(0, 0, size, size);
  const pxPerM = size / STICKER_TILE.tileM;
  const list = stickers();
  // Stickers keep off the tile's edges, so they are drawn once.
  const toPixel: ToPixel = (along, y) => ({
    x: along * pxPerM,
    y: (STICKER_TILE.tileM - y) * pxPerM,
  });
  for (const sticker of list) drawSticker(ctx, sticker, toPixel, pxPerM);
}

export type GrimeTexture = {
  readonly texture: CanvasTexture;
  dispose(): void;
};

/** A grime colour texture and its matching roughness texture. */
export type GrimeTextures = {
  readonly texture: CanvasTexture;
  readonly roughness: CanvasTexture;
  dispose(): void;
};

function canvasTexture(
  doc: Document,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): GrimeTexture {
  const canvas = doc.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) draw(ctx);
  // Plain numbers (multipliers), not colours: no sRGB decoding unless a caller says so.
  const texture = new CanvasTexture(canvas);
  texture.anisotropy = 4;
  return {
    texture,
    dispose() {
      texture.dispose();
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

function pair(colour: GrimeTexture, roughness: GrimeTexture): GrimeTextures {
  return {
    texture: colour.texture,
    roughness: roughness.texture,
    dispose() {
      colour.dispose();
      roughness.dispose();
    },
  };
}

/**
 * The wall grime atlas (a cell per side) shared by the walls and the trim, and its
 * roughness at half the size (roughness changes softly, so 1K is plenty).
 */
export function createWallGrime(doc: Document = document): GrimeTextures {
  const colour = canvasTexture(
    doc,
    GRIME_TEXTURE.widthPx,
    GRIME_TEXTURE.heightPx,
    (ctx) => {
      drawWallAtlas(ctx, colourStyle);
    },
  );
  const roughness = canvasTexture(
    doc,
    GRIME_TEXTURE.widthPx / 2,
    GRIME_TEXTURE.heightPx / 2,
    (ctx) => {
      ctx.scale(0.5, 0.5);
      drawWallAtlas(ctx, roughnessStyle);
    },
  );
  return pair(colour, roughness);
}

/** The repeating prop grime tile for the detail props and the cabinet, with its roughness. */
export function createPropGrime(doc: Document = document): GrimeTextures {
  const size = PROP_GRIME.sizePx;
  const colour = canvasTexture(doc, size, size, (ctx) => {
    drawPropTile(ctx, size, colourStyle);
  });
  const roughness = canvasTexture(doc, size / 2, size / 2, (ctx) => {
    drawPropTile(ctx, size / 2, roughnessStyle);
  });
  for (const t of [colour.texture, roughness.texture]) {
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
  }
  return pair(colour, roughness);
}

/** The pavement seen from above (task 24): a neutral fill, then its marks. */
function drawSidewalk(
  ctx: CanvasRenderingContext2D,
  size: number,
  style: Style,
): void {
  ctx.fillStyle = tintStyle([1, 1, 1]);
  ctx.fillRect(0, 0, size, size);
  const k = size / SIDEWALK_GRIME.sizePx;
  const toPixel: ToPixel = (x, z) => {
    const p = sidewalkPixel(x, z);
    return { x: p.x * k, y: p.y * k };
  };
  for (const mark of sidewalkGrimeMarks())
    drawMark(ctx, mark, toPixel, sidewalkPxPerM() * k, style);
}

/**
 * The pavement's grime (task 24), with its roughness at half the size: one top-down
 * texture over the whole pavement and its kerbs.
 */
export function createSidewalkGrime(doc: Document = document): GrimeTextures {
  const size = SIDEWALK_GRIME.sizePx;
  const colour = canvasTexture(doc, size, size, (ctx) => {
    drawSidewalk(ctx, size, colourStyle);
  });
  const roughness = canvasTexture(doc, size / 2, size / 2, (ctx) => {
    drawSidewalk(ctx, size / 2, roughnessStyle);
  });
  return pair(colour, roughness);
}

/** The repeating sticker tile (colour, with clear paper round the stickers). */
export function createStickerTile(doc: Document = document): GrimeTexture {
  const size = STICKER_TILE.sizePx;
  const tile = canvasTexture(doc, size, size, drawStickerTile);
  tile.texture.colorSpace = SRGBColorSpace;
  tile.texture.wrapS = RepeatWrapping;
  tile.texture.wrapT = RepeatWrapping;
  return tile;
}

/** Where a material reads its grime: its own `grimeUv` attribute, or its first UVs scaled. */
export type GrimeUvSource =
  | { readonly kind: "attribute" }
  | { readonly kind: "uv"; readonly scale: number };

export type GrimeOptions = {
  readonly grime: GrimeTextures;
  readonly source: GrimeUvSource;
  /**
   * Stickers and worn edges (props only). Needs the geometry's `faceUv`, `faceSize` and
   * `sticker` attributes (`logic/wearLayout.ts`); stickers read the first UVs times `scale`.
   */
  readonly wear?: { readonly stickers: Texture; readonly scale: number };
  /** Darkens everything within `WEAR.baseHeightM` of the ground (the cabinet's dirty base). */
  readonly dirtyBase?: boolean;
};

const glslTint = (t: readonly number[]): string =>
  `vec3( ${t.map((c) => c.toFixed(4)).join(", ")} )`;

/**
 * Weathers a standard material, adding no draw call: its base colour is multiplied by the
 * grime texture (stored at half scale, so 0.5 leaves it as it is, and raised to
 * `GRIME_LOOK.contrast`) after its colour map, so the grime layers over the user's textures
 * or the plain colours alike, and its roughness by the matching roughness texture (wet runs
 * glossy, soot and salt matte). With `wear`, stickers are pasted on and the paint wears
 * through near the box edges; with `dirtyBase`, the bottom gets grimy.
 */
export function addGrime(
  material: MeshStandardMaterial,
  options: GrimeOptions,
): void {
  const { source, wear } = options;
  const uniforms = {
    grimeMap: { value: options.grime.texture },
    grimeRoughnessMap: { value: options.grime.roughness },
    grimeScale: { value: source.kind === "uv" ? source.scale : 1 },
    grimeContrast: { value: GRIME_LOOK.contrast },
    stickerMap: { value: wear?.stickers ?? null },
    stickerScale: { value: wear?.scale ?? 1 },
  };
  const attribute = source.kind === "attribute";
  const worn = wear !== undefined;
  const dirtyBase = options.dirtyBase === true;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          attribute ? "attribute vec2 grimeUv;" : "uniform float grimeScale;",
          "varying vec2 vGrimeUv;",
          "varying vec3 vGrimeWorld;",
          ...(worn
            ? [
                "uniform float stickerScale;",
                "attribute vec2 faceUv;",
                "attribute vec2 faceSize;",
                "attribute float sticker;",
                "varying vec2 vFaceUv;",
                "varying vec2 vFaceSize;",
                "varying float vSticker;",
                "varying vec2 vStickerUv;",
              ]
            : []),
        ].join("\n"),
      )
      .replace(
        "#include <begin_vertex>",
        [
          "#include <begin_vertex>",
          attribute ? "vGrimeUv = grimeUv;" : "vGrimeUv = uv * grimeScale;",
          "vGrimeWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;",
          ...(worn
            ? [
                "vFaceUv = faceUv;",
                "vFaceSize = faceSize;",
                "vSticker = sticker;",
                "vStickerUv = uv * stickerScale;",
              ]
            : []),
        ].join("\n"),
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          "uniform sampler2D grimeMap;",
          "uniform sampler2D grimeRoughnessMap;",
          "uniform float grimeContrast;",
          "varying vec2 vGrimeUv;",
          "varying vec3 vGrimeWorld;",
          ...(worn
            ? [
                "uniform sampler2D stickerMap;",
                "varying vec2 vFaceUv;",
                "varying vec2 vFaceSize;",
                "varying float vSticker;",
                "varying vec2 vStickerUv;",
                "float grimeHash( vec3 p ) {",
                "  return fract( sin( dot( p, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );",
                "}",
                // Smooth value noise, so worn patches have soft ragged outlines, not blocks.
                "float grimeNoise( vec3 p ) {",
                "  vec3 i = floor( p );",
                "  vec3 f = fract( p );",
                "  f = f * f * ( 3.0 - 2.0 * f );",
                "  float a = mix( grimeHash( i ), grimeHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x );",
                "  float b = mix( grimeHash( i + vec3( 0.0, 1.0, 0.0 ) ), grimeHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x );",
                "  float c = mix( grimeHash( i + vec3( 0.0, 0.0, 1.0 ) ), grimeHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x );",
                "  float d = mix( grimeHash( i + vec3( 0.0, 1.0, 1.0 ) ), grimeHash( i + vec3( 1.0, 1.0, 1.0 ) ), f.x );",
                "  return mix( mix( a, b, f.y ), mix( c, d, f.y ), f.z );",
                "}",
              ]
            : []),
        ].join("\n"),
      )
      .replace(
        "#include <map_fragment>",
        [
          "#include <map_fragment>",
          "diffuseColor.rgb *= pow( texture2D( grimeMap, vGrimeUv ).rgb * 2.0, vec3( grimeContrast ) );",
          ...(dirtyBase
            ? [
                `diffuseColor.rgb *= mix( ${(1 - WEAR.baseStrength).toFixed(4)}, 1.0, smoothstep( 0.0, ${WEAR.baseHeightM.toFixed(4)}, vGrimeWorld.y ) );`,
              ]
            : []),
        ].join("\n"),
      )
      .replace(
        "#include <color_fragment>",
        [
          "#include <color_fragment>",
          ...(worn
            ? [
                // Stickers over the paint, under the wear.
                "vec4 grimeSticker = texture2D( stickerMap, vStickerUv );",
                "diffuseColor.rgb = mix( diffuseColor.rgb, grimeSticker.rgb, grimeSticker.a * vSticker );",
                // Paint worn through near the face's edges, in broken patches.
                "vec2 grimeEdge = min( vFaceUv, vFaceSize - vFaceUv );",
                `grimeEdge = mix( grimeEdge, vec2( 1.0 ), step( vFaceSize, vec2( ${(WEAR.edgeM * WEAR.minFaceEdges).toFixed(4)} ) ) );`,
                // The worn band's width wanders along the edge, and only some of the edge is
                // worn through at all.
                `vec3 grimeCell = vGrimeWorld / ${WEAR.noiseCellM.toFixed(4)};`,
                `float grimeWidth = ${WEAR.edgeM.toFixed(4)} * ( 0.25 + 1.5 * grimeNoise( grimeCell ) );`,
                "float grimeWear = 1.0 - smoothstep( 0.0, grimeWidth, min( grimeEdge.x, grimeEdge.y ) );",
                `grimeWear *= smoothstep( ${(0.95 - WEAR.coverage).toFixed(4)}, ${(1.05 - WEAR.coverage).toFixed(4)}, grimeNoise( grimeCell * 0.3 + 17.0 ) );`,
                `diffuseColor.rgb = mix( diffuseColor.rgb, ${glslTint(WEAR.color)}, grimeWear * ${WEAR.strength.toFixed(4)} );`,
              ]
            : []),
        ].join("\n"),
      )
      .replace(
        "#include <roughnessmap_fragment>",
        [
          "#include <roughnessmap_fragment>",
          "roughnessFactor = clamp( roughnessFactor * texture2D( grimeRoughnessMap, vGrimeUv ).r * 2.0, 0.08, 1.0 );",
        ].join("\n"),
      );
  };
  material.customProgramCacheKey = () =>
    `grime-${source.kind}-${worn ? "worn" : "plain"}-${dirtyBase ? "base" : "nobase"}`;
}
