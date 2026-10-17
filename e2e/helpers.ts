import { expect, type CDPSession, type Page } from "@playwright/test";
import type { Side, Vec3 } from "../src/logic/buildingLayout";
import { posePosition, sidePose } from "../src/logic/cameraOrbit";

/** Shared setup for the smoke specs (split out of smoke.spec.ts, task 39). */

/**
 * Where a world point lands in the canvas from a side's view (the app's 50° camera), in
 * page pixels, so a test can click one poster or look at one window.
 */
export function screenPointFromSide(
  side: Side,
  point: Vec3,
  box: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  const pose = sidePose(side);
  const eye = posePosition(pose);
  const sub = (a: Vec3, b: Vec3): Vec3 => ({
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  });
  const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross = (a: Vec3, b: Vec3): Vec3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  });
  const unit = (a: Vec3): Vec3 => {
    const l = Math.hypot(a.x, a.y, a.z);
    return { x: a.x / l, y: a.y / l, z: a.z / l };
  };
  const forward = unit(sub(pose.target, eye));
  const right = unit(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = cross(right, forward);
  const d = sub(point, eye);
  const depth = dot(d, forward);
  const halfTan = Math.tan((25 * Math.PI) / 180);
  const ndcX = dot(d, right) / depth / (halfTan * (box.width / box.height));
  const ndcY = dot(d, up) / depth / halfTan;
  return {
    x: box.x + ((ndcX + 1) / 2) * box.width,
    y: box.y + ((1 - ndcY) / 2) * box.height,
  };
}

export type Box = { x: number; y: number; width: number; height: number };

export type ClipStats = {
  /** The clip as captured (PNG, base64), to compare two captures. */
  png: string;
  /** Mean of each pixel's brightest channel, and the brightest channel anywhere (0 to 255). */
  mean: number;
  max: number;
  /** Share of the lit pixels (a channel over 24) that are warm: yellow, amber or orange. */
  warmShare: number;
  /** Share of all pixels that are lit and cold: green or blue leading red. */
  coldShare: number;
};

/** Captures a page rectangle and measures its pixels. */
export async function clipStats(
  cdp: CDPSession,
  page: Page,
  clip: Box,
): Promise<ClipStats> {
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    clip: {
      x: Math.round(clip.x),
      y: Math.round(clip.y),
      width: Math.round(clip.width),
      height: Math.round(clip.height),
      scale: 1,
    },
  });
  const stats = await page.evaluate(async (png) => {
    const img = new Image();
    img.src = `data:image/png;base64,${png}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    if (ctx === null) return { mean: 255, max: 255, warm: 1, cold: 0 };
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
    let max = 0;
    let sum = 0;
    let lit = 0;
    let warm = 0;
    let cold = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] ?? 0;
      const g = pixels[i + 1] ?? 0;
      const b = pixels[i + 2] ?? 0;
      const top = Math.max(r, g, b);
      max = Math.max(max, top);
      sum += top;
      if (top <= 24) continue;
      lit += 1;
      if (r > b * 1.3 && g > b * 1.3) warm += 1;
      else if (g > r || b > r) cold += 1;
    }
    const n = pixels.length / 4;
    return {
      mean: sum / n,
      max,
      warm: lit === 0 ? 0 : warm / lit,
      cold: cold / n,
    };
  }, data);
  return {
    png: data,
    mean: stats.mean,
    max: stats.max,
    warmShare: stats.warm,
    coldShare: stats.cold,
  };
}

/** Root font size in the panel CSS (rem); the panel's min and max heights are 18rem and 32rem. */
export const REM = 16;
const PANEL_GAP = 2.5 * REM;

/**
 * Every panel opens centred on the window at the same width (task 18), with a height that
 * fits its content between min(18rem, window - 2.5rem) and min(32rem, window - 2.5rem).
 */
export function expectCentredAndFitting(
  boxes: ReadonlyMap<string, Box | null>,
  viewport: { width: number; height: number } | null,
): void {
  expect(viewport).not.toBeNull();
  const first = [...boxes.values()][0];
  for (const box of boxes.values()) {
    expect(box).not.toBeNull();
    if (box === null || first === null || first === undefined || !viewport)
      continue;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(
      2,
    );
    expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(
      2,
    );
    expect(Math.abs(box.width - first.width)).toBeLessThan(2);
    const minHeight = Math.min(18 * REM, viewport.height - PANEL_GAP);
    const maxHeight = Math.min(32 * REM, viewport.height - PANEL_GAP);
    expect(box.height).toBeGreaterThanOrEqual(minHeight - 1);
    expect(box.height).toBeLessThanOrEqual(maxHeight + 1);
  }
}
