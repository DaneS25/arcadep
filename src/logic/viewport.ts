/** Highest device pixel ratio the renderer uses, per the stack rules. */
export const MAX_PIXEL_RATIO = 2;

export type Viewport = {
  /** CSS pixels. */
  width: number;
  /** CSS pixels. */
  height: number;
  pixelRatio: number;
  aspect: number;
};

/** Caps the device pixel ratio at `MAX_PIXEL_RATIO`; bad input falls back to 1. */
export function capPixelRatio(devicePixelRatio: number): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) return 1;
  return Math.min(devicePixelRatio, MAX_PIXEL_RATIO);
}

/** Works out the drawing size from the canvas's client size. A collapsed canvas counts as 1x1. */
export function computeViewport(
  clientWidth: number,
  clientHeight: number,
  devicePixelRatio: number,
): Viewport {
  const width = Math.max(1, Math.floor(clientWidth));
  const height = Math.max(1, Math.floor(clientHeight));
  return {
    width,
    height,
    pixelRatio: capPixelRatio(devicePixelRatio),
    aspect: width / height,
  };
}

/** True when the viewport differs from the one last applied (or none was applied yet). */
export function viewportChanged(
  previous: Viewport | undefined,
  next: Viewport,
): boolean {
  if (previous === undefined) return true;
  return (
    previous.width !== next.width ||
    previous.height !== next.height ||
    previous.pixelRatio !== next.pixelRatio
  );
}
