import { WebGLRenderer } from "three";

export type RendererResult =
  { ok: true; renderer: WebGLRenderer } | { ok: false; reason: string };

/** Creates the one WebGL renderer. WebGL being unavailable is an expected failure, not a crash. */
export function createRenderer(canvas: HTMLCanvasElement): RendererResult {
  try {
    const renderer = new WebGLRenderer({
      canvas,
      // Everything renders through the composer's multisampled target (postProcessing.ts).
      antialias: false,
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
