import {
  CanvasTexture,
  Color,
  Group,
  Mesh,
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
  type PixelRect,
} from "@/logic/graffitiLayout";
import { TAG_SEED, graffitiTags, type TagSpec } from "@/logic/graffitiTags";
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
  readonly object: Group;
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
const POSTER_ACCENTS: readonly PaletteToken[] = ["accent", "cyan", "amber"];

function drawTag(
  ctx: CanvasRenderingContext2D,
  band: PixelRect,
  tag: TagSpec,
  family: string,
): void {
  const size = tag.size * band.height;
  const color = PALETTE[tag.color];
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

  if (tag.style === "outline") {
    ctx.lineWidth = size * 0.14;
    ctx.strokeStyle = color;
    ctx.strokeText(tag.text, 0, 0);
    ctx.fillStyle = PALETTE.base;
    ctx.fillText(tag.text, 0, 0);
  } else {
    ctx.lineWidth = size * 0.12;
    ctx.strokeStyle = PALETTE.base;
    ctx.strokeText(tag.text, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(tag.text, 0, 0);
  }

  if (tag.drips.length > 0) {
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
 * The back side's graffiti alley: procedural tags across the back spot and a paste-up
 * poster per project over them. The tags and every poster share one atlas canvas texture
 * and merge into one mesh (one draw call). The wall is picked as `spot-back` and glows a
 * little brighter on hover. Thumbnails come in after loading; until then (or if one is
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
  const tags = graffitiTags(TAG_SEED);
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
  const mesh = new Mesh(geometry, material);
  mesh.name = "graffiti";

  const group = new Group();
  group.name = layout.id;
  group.userData = { spotId: layout.id, side: layout.side };
  group.add(mesh);

  const redraw = (): void => {
    if (ctx === null) return;
    const fonts = {
      marker: fontStack(FONTS.marker, true),
      mono: fontStack(FONTS.mono, true),
      neon: fontStack(FONTS.neon, true),
    };
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const tag of tags) drawTag(ctx, layout.wallRect, tag, fonts.marker);
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
    // Posters show the first projects in order, so a poster's index is its project's.
    posterAt: (point) => posterAt(layout, point),
    setHighlighted(on) {
      material.emissiveIntensity = on
        ? GRAFFITI_LOOK.litEmissiveIntensity
        : GRAFFITI_LOOK.emissiveIntensity;
    },
    setThumbnails(next) {
      thumbnails = next;
      redraw();
    },
    redraw,
    dispose() {
      group.clear();
      thumbnails = new Map();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
