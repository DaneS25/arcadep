import {
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
} from "three";
import type { Project } from "@/content/types";
import type { Vec3 } from "@/logic/buildingLayout";
import { FONTS, fontStack } from "@/logic/assetManifest";
import {
  GRAFFITI_TEXTURE,
  atlasQuadGeometryData,
  graffitiLayout,
  posterAt,
  posterGlowScale,
  WEATHER_COLORS,
  posterVertexFlags,
  sillDrips,
  weatherStreaks,
  type PixelRect,
  type SillDrip,
  type WeatherStreak,
} from "@/logic/graffitiLayout";
import {
  TAG_SEED,
  graffitiArt,
  type BuffPatch,
  type TagSpec,
} from "@/logic/graffitiTags";
import { GRAFFITI_LOOK } from "@/logic/lookConfig";
import { seedFromText } from "@/logic/neonFlicker";
import { PALETTE, type PaletteToken } from "@/logic/palette";
import { createRng } from "@/logic/rng";
import { fitFont, toGeometry } from "./canvasText";

/** What a poster shows about a project (from `src/content/projects.ts`). */
export type PosterProject = Pick<
  Project,
  "id" | "title" | "thumbnail" | "tags"
>;

/** Loaded thumbnails by their site path; a project without one gets a generated placeholder. */
export type Thumbnails = ReadonlyMap<string, HTMLImageElement>;

export type GraffitiWall = {
  /** Everything drawn, plus the pick area. */
  readonly object: Group;
  /**
   * What picking registers as `spot-back`: an invisible quad over the poster row only, so
   * a click on the graffiti higher up or along the wall does nothing (task 19).
   */
  readonly pickObject: Group;
  /**
   * The project whose poster is at a world point on the wall (a picking hit), as an index
   * into the projects given, or undefined between posters.
   */
  posterAt(point: Vec3): number | undefined;
  setHighlighted(on: boolean): void;
  /** Puts the loaded thumbnails on the posters and redraws. */
  setThumbnails(thumbnails: Thumbnails): void;
  /** Draws the atlas again, for example once the fonts have loaded. */
  redraw(): void;
  dispose(): void;
};

/** Accent colour per poster, in turn. */
const POSTER_ACCENTS: readonly PaletteToken[] = ["accent", "cyan", "violet"];

/** A patch of flat paint rolled over the older graffiti, with roller marks. */
function drawBuff(
  ctx: CanvasRenderingContext2D,
  band: PixelRect,
  buff: BuffPatch,
): void {
  const w = buff.width * band.width;
  const h = buff.height * band.height;
  ctx.save();
  ctx.translate(band.x + buff.x * band.width, band.y + buff.y * band.height);
  ctx.rotate(buff.angleRad);
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = PALETTE[buff.color];
  ctx.fillRect(-w / 2, -h / 2, w, h);
  // Roller strokes: faint darker bands across the patch.
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = PALETTE.base;
  for (let y = -h / 2; y < h / 2; y += 24) ctx.fillRect(-w / 2, y, w, 6);
  ctx.restore();
}

/** A colour with an alpha, from a `#rrggbb` hex. */
function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${String((n >> 16) & 255)}, ${String((n >> 8) & 255)}, ${String(n & 255)}, ${String(alpha)})`;
}

/** Rain and rust run down over the paint only (`source-atop` keeps the gaps clear). */
function drawWeather(
  ctx: CanvasRenderingContext2D,
  streaks: readonly WeatherStreak[],
): void {
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  for (const { rect, color, strength } of streaks) {
    const gradient = ctx.createLinearGradient(
      0,
      rect.y + rect.height,
      0,
      rect.y,
    );
    gradient.addColorStop(0, withAlpha(color, strength));
    gradient.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
  ctx.restore();
}

/** A stain spreading down from a sill, with paint run off it. */
function drawSillDrip(ctx: CanvasRenderingContext2D, drip: SillDrip): void {
  const { stain } = drip;
  const gradient = ctx.createLinearGradient(
    0,
    stain.y,
    0,
    stain.y + stain.height,
  );
  gradient.addColorStop(0, withAlpha(WEATHER_COLORS.sill, 0.9));
  gradient.addColorStop(0.3, withAlpha(WEATHER_COLORS.sill, 0.55));
  gradient.addColorStop(1, withAlpha(WEATHER_COLORS.sill, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(stain.x, stain.y, stain.width, stain.height);
  for (const run of drip.runs) {
    ctx.strokeStyle = run.color;
    ctx.fillStyle = run.color;
    ctx.lineWidth = run.widthPx;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(run.x, run.y);
    ctx.lineTo(run.x, run.y + run.lengthPx);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(run.x, run.y + run.lengthPx, run.widthPx * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawDrips(
  ctx: CanvasRenderingContext2D,
  tag: TagSpec,
  size: number,
  color: string,
): void {
  const width = ctx.measureText(tag.text).width;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, size * 0.05);
  for (const drip of tag.drips) {
    const x = drip.at * width;
    const top = size * 0.25;
    const bottom = top + drip.length * size;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, bottom, ctx.lineWidth * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTag(
  ctx: CanvasRenderingContext2D,
  band: PixelRect,
  tag: TagSpec,
  family: string,
): void {
  const size = tag.size * band.height;
  const color = PALETTE[tag.color];
  const outline = PALETTE[tag.outline];
  ctx.save();
  ctx.translate(band.x + tag.x * band.width, band.y + tag.y * band.height);
  ctx.rotate(tag.angleRad);
  ctx.font = `${String(Math.round(size))}px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  // Sprayed paint is never quite solid.
  ctx.globalAlpha = 0.88;

  switch (tag.style) {
    case "throwup":
      // Fat outline first, then the fill, then a thin dark line to split the letters.
      ctx.lineWidth = size * 0.3;
      ctx.strokeStyle = outline;
      ctx.strokeText(tag.text, 0, 0);
      ctx.fillStyle = color;
      ctx.fillText(tag.text, 0, 0);
      ctx.lineWidth = Math.max(1.5, size * 0.03);
      ctx.strokeStyle = PALETTE.base;
      ctx.strokeText(tag.text, 0, 0);
      break;
    case "outline":
      ctx.lineWidth = size * 0.14;
      ctx.strokeStyle = color;
      ctx.strokeText(tag.text, 0, 0);
      ctx.fillStyle = PALETTE.base;
      ctx.fillText(tag.text, 0, 0);
      break;
    case "scrawl":
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = Math.max(1, size * 0.06);
      ctx.strokeStyle = color;
      ctx.strokeText(tag.text, 0, 0);
      ctx.fillStyle = color;
      ctx.fillText(tag.text, 0, 0);
      break;
    case "fill":
    case "drip":
      ctx.lineWidth = size * 0.12;
      ctx.strokeStyle = outline;
      ctx.strokeText(tag.text, 0, 0);
      ctx.fillStyle = color;
      ctx.fillText(tag.text, 0, 0);
      break;
  }

  if (tag.drips.length > 0) drawDrips(ctx, tag, size, color);
  ctx.restore();
}

/** The thumbnail scaled to cover `box`, cropped to its centre. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  box: PixelRect,
): void {
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  if (iw <= 0 || ih <= 0) return;
  const scale = Math.max(box.width / iw, box.height / ih);
  const sw = box.width / scale;
  const sh = box.height / scale;
  ctx.drawImage(
    image,
    (iw - sw) / 2,
    (ih - sh) / 2,
    sw,
    sh,
    box.x,
    box.y,
    box.width,
    box.height,
  );
}

/** A generated stand-in until the project's screenshot is added: stripes and initials. */
function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  box: PixelRect,
  title: string,
  color: string,
  family: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.width, box.height);
  ctx.clip();
  ctx.fillStyle = PALETTE.base;
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 10;
  for (let d = -box.height; d < box.width; d += 28) {
    ctx.beginPath();
    ctx.moveTo(box.x + d, box.y + box.height);
    ctx.lineTo(box.x + d + box.height, box.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const initials = title
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitFont(ctx, initials, family, 96, box.width - 24);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillText(initials, box.x + box.width / 2, box.y + box.height / 2);
  ctx.restore();
}

function drawPoster(
  ctx: CanvasRenderingContext2D,
  cell: PixelRect,
  project: PosterProject,
  image: HTMLImageElement | undefined,
  color: string,
  fonts: { marker: string; mono: string; neon: string },
): void {
  const rng = createRng(seedFromText(project.id));
  const inset = 6;
  const left = cell.x + inset;
  const top = cell.y + inset;
  const right = cell.x + cell.width - inset;
  const bottom = cell.y + cell.height - inset;

  // Paper with a slightly torn edge.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(left, top);
  const step = 16;
  for (let x = left + step; x < right; x += step)
    ctx.lineTo(x, top + rng.range(0, 4));
  ctx.lineTo(right, top);
  for (let y = top + step; y < bottom; y += step)
    ctx.lineTo(right - rng.range(0, 4), y);
  ctx.lineTo(right, bottom);
  for (let x = right - step; x > left; x -= step)
    ctx.lineTo(x, bottom - rng.range(0, 5));
  ctx.lineTo(left, bottom);
  for (let y = bottom - step; y > top; y -= step)
    ctx.lineTo(left + rng.range(0, 4), y);
  ctx.closePath();
  ctx.fillStyle = PALETTE.posterPaper;
  ctx.fill();
  ctx.restore();

  const pad = 16;
  const picture: PixelRect = {
    x: left + pad,
    y: top + pad,
    width: right - left - 2 * pad,
    height: Math.round((bottom - top) * 0.62),
  };
  if (image === undefined)
    drawPlaceholder(ctx, picture, project.title, color, fonts.neon);
  else drawCover(ctx, image, picture);

  const centreX = (left + right) / 2;
  const textWidth = right - left - 2 * pad;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = PALETTE.base;
  fitFont(ctx, project.title, fonts.marker, 34, textWidth);
  ctx.fillText(project.title, centreX, picture.y + picture.height + 34);

  const tags = project.tags.join(" / ");
  if (tags !== "") {
    ctx.fillStyle = PALETTE.trim;
    fitFont(ctx, tags, fonts.mono, 16, textWidth);
    ctx.fillText(tags, centreX, picture.y + picture.height + 70);
  }

  // A stripe of the poster's colour along the bottom, and tape over the top corners.
  ctx.fillStyle = color;
  ctx.fillRect(left + pad, bottom - 14, right - left - 2 * pad, 4);
  ctx.fillStyle = "rgb(255 255 255 / 45%)";
  for (const [x, angle] of [
    [left + 8, -0.6],
    [right - 8, 0.6],
  ] as const) {
    ctx.save();
    ctx.translate(x, top + 8);
    ctx.rotate(angle);
    ctx.fillRect(-22, -8, 44, 16);
    ctx.restore();
  }
}

/**
 * The back side's graffiti alley: layered procedural graffiti over the whole back wall up
 * into the second storey (task 19) and a paste-up poster per project on the ground floor.
 * The graffiti and every poster share one atlas canvas texture and merge into one mesh (one
 * draw call). Only the poster row is picked as `spot-back` (an invisible quad, never
 * drawn), and only the posters glow brighter on hover: a per-vertex poster flag and a
 * `posterGlow` uniform patched into the standard material, so still one draw call. Thumbnails come in after loading; until then (or if one is
 * missing) a poster shows a generated placeholder.
 */
export function createGraffitiWall(
  projects: readonly PosterProject[],
  doc: Document = document,
): GraffitiWall {
  const layout = graffitiLayout(
    projects.length,
    seedFromText(projects.map((p) => p.id).join("|")),
  );
  const shown = projects.slice(0, layout.posters.length);
  const art = graffitiArt(TAG_SEED);
  const weather = weatherStreaks(layout);
  const drips = sillDrips(layout);
  let thumbnails: Thumbnails = new Map();

  const canvas = doc.createElement("canvas");
  canvas.width = GRAFFITI_TEXTURE.widthPx;
  canvas.height = GRAFFITI_TEXTURE.heightPx;
  const ctx = canvas.getContext("2d");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;

  const geometry = toGeometry(
    atlasQuadGeometryData([
      layout.wall,
      ...layout.posters.map((poster) => poster.quad),
    ]),
  );
  const material = new MeshStandardMaterial({
    map: texture,
    emissiveMap: texture,
    emissive: new Color(1, 1, 1),
    emissiveIntensity: GRAFFITI_LOOK.emissiveIntensity,
    roughness: GRAFFITI_LOOK.roughness,
    transparent: true,
    alphaTest: GRAFFITI_LOOK.alphaTest,
  });
  geometry.setAttribute(
    "poster",
    new Float32BufferAttribute(posterVertexFlags(layout), 1),
  );
  // Scales the emissive light of flagged (poster) vertices only; set on hover.
  const posterGlow = { value: 1 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.posterGlow = posterGlow;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          "attribute float poster;",
          "varying float vPoster;",
        ].join("\n"),
      )
      .replace(
        "#include <begin_vertex>",
        ["#include <begin_vertex>", "vPoster = poster;"].join("\n"),
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          "uniform float posterGlow;",
          "varying float vPoster;",
        ].join("\n"),
      )
      .replace(
        "#include <emissivemap_fragment>",
        [
          "#include <emissivemap_fragment>",
          "totalEmissiveRadiance *= mix(1.0, posterGlow, vPoster);",
        ].join("\n"),
      );
  };
  material.customProgramCacheKey = () => "graffiti-poster-glow";
  const mesh = new Mesh(geometry, material);
  mesh.name = "graffiti";

  const pickGeometry = toGeometry(atlasQuadGeometryData([layout.pickArea]));
  const pickMaterial = new MeshBasicMaterial({ visible: false });
  const pickMesh = new Mesh(pickGeometry, pickMaterial);
  pickMesh.name = "graffiti-posters-pick";
  const pickGroup = new Group();
  pickGroup.name = layout.id;
  pickGroup.userData = { spotId: layout.id, side: layout.side };
  pickGroup.add(pickMesh);

  const group = new Group();
  group.name = "graffiti-wall";
  group.add(mesh, pickGroup);

  const redraw = (): void => {
    if (ctx === null) return;
    const fonts = {
      marker: fontStack(FONTS.marker, true),
      mono: fontStack(FONTS.mono, true),
      neon: fontStack(FONTS.neon, true),
    };
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const buff of art.buffs) drawBuff(ctx, layout.wallRect, buff);
    for (const tag of art.tags)
      drawTag(ctx, layout.wallRect, tag, fonts.marker);
    // Weathered paint, then the windows' glass wiped clean (the paint stops at their
    // frames, task 20), then the stains and paint runs under a few sills (task 22).
    drawWeather(ctx, weather);
    for (const r of layout.clearRects)
      ctx.clearRect(r.x, r.y, r.width, r.height);
    for (const drip of drips) drawSillDrip(ctx, drip);
    shown.forEach((project, i) => {
      const poster = layout.posters[i];
      if (poster === undefined) return;
      const token = POSTER_ACCENTS[i % POSTER_ACCENTS.length] ?? "accent";
      drawPoster(
        ctx,
        poster.cell,
        project,
        thumbnails.get(project.thumbnail),
        PALETTE[token],
        fonts,
      );
    });
    texture.needsUpdate = true;
  };
  redraw();

  return {
    object: group,
    pickObject: pickGroup,
    // Posters show the first projects in order, so a poster's index is its project's.
    posterAt: (point) => posterAt(layout, point),
    setHighlighted(on) {
      posterGlow.value = posterGlowScale(
        on,
        GRAFFITI_LOOK.emissiveIntensity,
        GRAFFITI_LOOK.litEmissiveIntensity,
      );
    },
    setThumbnails(next) {
      thumbnails = next;
      redraw();
    },
    redraw,
    dispose() {
      group.clear();
      thumbnails = new Map();
      pickGroup.clear();
      geometry.dispose();
      material.dispose();
      pickGeometry.dispose();
      pickMaterial.dispose();
      texture.dispose();
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
