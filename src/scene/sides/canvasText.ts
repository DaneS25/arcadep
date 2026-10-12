import { BufferGeometry, Float32BufferAttribute } from "three";
import type { GeometryData } from "@/logic/boxGeometry";

/** Wraps pure vertex data in a `BufferGeometry`. */
export function toGeometry(data: GeometryData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(data.positions, 3),
  );
  geometry.setAttribute("normal", new Float32BufferAttribute(data.normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(data.uvs, 2));
  geometry.setIndex(data.indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** Sets a font no larger than `sizePx` that fits `text` in `maxWidth`. */
export function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  sizePx: number,
  maxWidth: number,
): void {
  ctx.font = `${String(sizePx)}px ${family}`;
  const width = ctx.measureText(text).width;
  if (width > maxWidth && width > 0) {
    const fitted = Math.max(8, Math.floor((sizePx * maxWidth) / width));
    ctx.font = `${String(fitted)}px ${family}`;
  }
}

/** Text with a neon glow round it. */
export function glowText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  blur: number,
): void {
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}
