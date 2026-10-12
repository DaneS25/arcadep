import { PerspectiveCamera } from "three";
import { createDisposer } from "@/logic/disposer";
import { createFrameClock } from "@/logic/frameClock";
import {
  computeViewport,
  viewportChanged,
  type Viewport,
} from "@/logic/viewport";
import { createStage } from "@/scene/stage";
import {
  createAssetSources,
  createLoadingManager,
  loadAssets,
  type LoadedAssets,
} from "./assetLoader";
import { createCameraRig } from "./cameraRig";
import {
  createReducedMotion,
  type ReducedMotionSetting,
} from "./reducedMotion";
import { createRenderer } from "./renderer";

export type App = {
  readonly reducedMotion: ReducedMotionSetting;
  /** Settles once every optional asset has loaded or fallen back. Never rejects. */
  readonly assets: Promise<LoadedAssets>;
  dispose(): void;
};

export type StartResult =
  { ok: true; app: App } | { ok: false; reason: string };

export type AppOptions = {
  /** Asset loading progress from 0 to 1. */
  onLoadProgress: (ratio: number) => void;
  /** Where warnings go (missing assets). */
  warn: (message: string) => void;
};

/**
 * Builds the renderer, camera and stage inside `root`, starts the render loop and
 * starts loading the optional assets.
 */
export function startApp(
  root: HTMLElement,
  options: AppOptions,
  win: Window = window,
): StartResult {
  const canvas = win.document.createElement("canvas");
  canvas.className = "scene";
  root.append(canvas);

  const created = createRenderer(canvas);
  if (!created.ok) {
    canvas.remove();
    return created;
  }
  const { renderer } = created;
  const disposer = createDisposer();
  disposer.add(() => {
    canvas.remove();
  });
  disposer.add(() => {
    renderer.dispose();
  });

  const reducedMotion = createReducedMotion((query) => win.matchMedia(query));
  disposer.add(() => {
    reducedMotion.dispose();
  });

  const camera = new PerspectiveCamera(50, 1, 0.1, 200);
  const rig = createCameraRig({
    camera,
    dom: canvas,
    keyTarget: win,
    reducedMotion: () => reducedMotion.value,
    onArrive: (side) => {
      // Lets the smoke test (and later the overlays) see which side is in view.
      canvas.dataset.cameraSide = side;
    },
    onFreeLook: () => {
      delete canvas.dataset.cameraSide;
    },
  });
  disposer.add(() => {
    rig.dispose();
  });

  const stage = createStage();
  disposer.add(() => {
    stage.dispose();
  });

  const manager = createLoadingManager(options.onLoadProgress);
  const assets = loadAssets(
    createAssetSources(manager, win.document),
    options.warn,
  );
  // Disposer.add runs the step at once if the app was already disposed.
  void assets.then((loaded) => {
    disposer.add(() => {
      loaded.dispose();
    });
  });

  let applied: Viewport | undefined;
  const resizeIfNeeded = (): void => {
    const next = computeViewport(
      canvas.clientWidth,
      canvas.clientHeight,
      win.devicePixelRatio,
    );
    if (!viewportChanged(applied, next)) return;
    applied = next;
    renderer.setPixelRatio(next.pixelRatio);
    renderer.setSize(next.width, next.height, false);
    camera.aspect = next.aspect;
    camera.updateProjectionMatrix();
  };

  const clock = createFrameClock();
  renderer.setAnimationLoop((timeMs) => {
    const dtMs = clock.tick(timeMs);
    resizeIfNeeded();
    rig.update(dtMs);
    stage.update(dtMs);
    renderer.render(stage.scene, camera);
  });
  disposer.add(() => {
    renderer.setAnimationLoop(null);
  });

  return {
    ok: true,
    app: {
      reducedMotion,
      assets,
      dispose() {
        disposer.dispose();
      },
    },
  };
}
