import { WebGLRenderer } from "three";

export type RendererResult =
  { ok: true; renderer: WebGLRenderer } | { ok: false; reason: string };

/** Creates the one WebGL renderer. WebGL being unavailable is an expected failure, not a crash. */
export function createRenderer(canvas: HTMLCanvasElement): RendererResult {
  try {
    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    return { ok: true, renderer };
  } catch (error: unknown) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
