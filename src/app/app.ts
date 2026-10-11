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
  createReducedMotion,
  type ReducedMotionSetting,
} from "./reducedMotion";
import { createRenderer } from "./renderer";

export type App = {
  readonly reducedMotion: ReducedMotionSetting;
  dispose(): void;
};

export type StartResult =
  { ok: true; app: App } | { ok: false; reason: string };

/** Builds the renderer, camera and stage inside `root` and starts the render loop. */
export function startApp(root: HTMLElement, win: Window = window): StartResult {
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
  camera.position.set(0, 8, 22);
  camera.lookAt(0, 0, 0);

  const stage = createStage();
  disposer.add(() => {
    stage.dispose();
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
      dispose() {
        disposer.dispose();
      },
    },
  };
}
