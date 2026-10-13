import {
  NeutralToneMapping,
  HalfFloatType,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BLOOM, TONE_MAPPING } from "@/logic/lookConfig";

export type FrameStats = {
  /** Draw calls and triangles of the scene pass alone. */
  readonly sceneCalls: number;
  readonly sceneTriangles: number;
  /** Draw calls for the whole frame, bloom and output passes included. */
  readonly frameCalls: number;
  /** Textures the renderer holds on the GPU (`renderer.info.memory.textures`). */
  readonly textures: number;
};

export type PostProcessing = {
  render(dtMs: number): void;
  /** CSS size and pixel ratio, applied together with the camera's aspect. */
  setSize(width: number, height: number, pixelRatio: number): void;
  /** Counts from the last rendered frame. */
  stats(): FrameStats;
  dispose(): void;
};

/**
 * Three passes: the scene into a multisampled half-float target, bloom for the neon,
 * then tone mapping and sRGB output to the canvas.
 */
export function createPostProcessing(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
): PostProcessing {
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = TONE_MAPPING.exposure;
  // Count the whole frame (all passes), reset by hand at the start of each one.
  renderer.info.autoReset = false;

  // The canvas has no antialiasing of its own; the scene target is multisampled instead.
  const target = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new Vector2(1, 1),
    BLOOM.strength,
    BLOOM.radius,
    BLOOM.threshold,
  );
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);

  let stats: FrameStats = {
    sceneCalls: 0,
    sceneTriangles: 0,
    frameCalls: 0,
    textures: 0,
  };
  let sceneCalls = 0;
  let sceneTriangles = 0;
  scene.onAfterRender = () => {
    sceneCalls = renderer.info.render.calls;
    sceneTriangles = renderer.info.render.triangles;
  };

  return {
    render(dtMs) {
      renderer.info.reset();
      composer.render(dtMs / 1000);
      stats = {
        sceneCalls,
        sceneTriangles,
        frameCalls: renderer.info.render.calls,
        textures: renderer.info.memory.textures,
      };
    },
    setSize(width, height, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
    },
    stats() {
      return stats;
    },
    dispose() {
      scene.onAfterRender = () => {
        // Back to three's default, which does nothing.
      };
      renderer.info.autoReset = true;
      renderPass.dispose();
      bloomPass.dispose();
      outputPass.dispose();
      // Disposes both of the composer's targets (the first is `target`) and its copy pass.
      composer.dispose();
    },
  };
}
