import type { WindowCellId } from "@/logic/detailLayout";
import type { PixelRect } from "@/logic/graffitiLayout";
import { WINDOW_LOOK } from "@/logic/lookConfig";
import { createRng } from "@/logic/rng";

type Light = keyof typeof WINDOW_LOOK.lights;

/** A pane of light: brightest a little above the middle, falling off to the corners. */
function fillLit(
  ctx: CanvasRenderingContext2D,
  r: PixelRect,
  light: Light,
): void {
  const { glow, edge } = WINDOW_LOOK.lights[light];
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height * 0.4;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r.height * 0.7);
  gradient.addColorStop(0, glow);
  gradient.addColorStop(1, edge);
  ctx.fillStyle = gradient;
  ctx.fillRect(r.x, r.y, r.width, r.height);
}

/** The window bars: one upright and one cross bar, as a sash window has. */
function mullions(ctx: CanvasRenderingContext2D, r: PixelRect): void {
  ctx.fillStyle = WINDOW_LOOK.shadow;
  const bar = Math.max(3, Math.round(r.width * 0.05));
  ctx.fillRect(r.x + r.width / 2 - bar / 2, r.y, bar, r.height);
  ctx.fillRect(r.x, r.y + r.height * 0.48 - bar / 2, r.width, bar);
}

/** Half-closed blinds: dark slats down to about two thirds, one hanging crooked. */
function blinds(ctx: CanvasRenderingContext2D, r: PixelRect): void {
  ctx.fillStyle = WINDOW_LOOK.shadow;
  const slat = r.height / 24;
  const bottom = r.y + r.height * 0.66;
  for (let y = r.y; y < bottom; y += slat * 1.6) {
    ctx.fillRect(r.x, y, r.width, slat);
  }
  // One end of the blind slipped, so it hangs at a slant.
  ctx.save();
  ctx.translate(r.x, bottom);
  ctx.rotate(-0.12);
  ctx.fillRect(0, 0, r.width * 1.05, slat * 1.4);
  ctx.restore();
}

/** Someone standing in the room, a little left of centre: head and shoulders. */
function silhouette(ctx: CanvasRenderingContext2D, r: PixelRect): void {
  ctx.fillStyle = WINDOW_LOOK.shadow;
  const cx = r.x + r.width * 0.42;
  const head = r.width * 0.13;
  const headY = r.y + r.height * 0.42;
  ctx.beginPath();
  ctx.arc(cx, headY, head, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - r.width * 0.3, r.y + r.height);
  ctx.quadraticCurveTo(
    cx - r.width * 0.28,
    headY + head * 1.6,
    cx,
    headY + head * 1.3,
  );
  ctx.quadraticCurveTo(
    cx + r.width * 0.28,
    headY + head * 1.6,
    cx + r.width * 0.3,
    r.y + r.height,
  );
  ctx.closePath();
  ctx.fill();
}

/** Unlit glass with a faint diagonal sheen. */
function fillDark(ctx: CanvasRenderingContext2D, r: PixelRect): void {
  ctx.fillStyle = WINDOW_LOOK.dark;
  ctx.fillRect(r.x, r.y, r.width, r.height);
  const gradient = ctx.createLinearGradient(
    r.x,
    r.y,
    r.x + r.width,
    r.y + r.height,
  );
  gradient.addColorStop(0.2, WINDOW_LOOK.dark);
  gradient.addColorStop(0.35, WINDOW_LOOK.sheen);
  gradient.addColorStop(0.5, WINDOW_LOOK.dark);
  ctx.fillStyle = gradient;
  ctx.fillRect(r.x, r.y, r.width, r.height);
}

/** Dark glass with a hole knocked in it and cracks running out from it. */
function broken(ctx: CanvasRenderingContext2D, r: PixelRect): void {
  fillDark(ctx, r);
  const rng = createRng(0xb40c3);
  const cx = r.x + r.width * 0.6;
  const cy = r.y + r.height * 0.3;
  // The hole: a jagged star of black.
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  const points = 9;
  for (let i = 0; i < points; i += 1) {
    const angle = (i / points) * Math.PI * 2;
    const radius = r.width * (i % 2 === 0 ? 0.22 : 0.09) * rng.range(0.7, 1.2);
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  // Cracks: crooked lines from the hole out to the frame.
  ctx.strokeStyle = WINDOW_LOOK.crack;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 7; i += 1) {
    let angle = rng.range(0, Math.PI * 2);
    let x = cx;
    let y = cy;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let step = 0; step < 6; step += 1) {
      angle += rng.range(-0.4, 0.4);
      x += Math.cos(angle) * r.width * 0.12;
      y += Math.sin(angle) * r.width * 0.12;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  mullions(ctx, r);
}

/** Draws one window cell of the details atlas, clipped to its rectangle. */
export function drawWindowCell(
  ctx: CanvasRenderingContext2D,
  id: WindowCellId,
  r: PixelRect,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.width, r.height);
  ctx.clip();
  if (id === "dark") {
    fillDark(ctx, r);
    mullions(ctx, r);
  } else if (id === "broken") {
    broken(ctx, r);
  } else {
    const [look, light] = id.split("-") as [string, Light];
    fillLit(ctx, r, light);
    if (look === "blinds") blinds(ctx, r);
    if (look === "silhouette") silhouette(ctx, r);
    mullions(ctx, r);
  }
  ctx.restore();
}
