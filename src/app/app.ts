import { PerspectiveCamera } from "three";
import { createDisposer } from "@/logic/disposer";
import { createFrameClock } from "@/logic/frameClock";
import {
  computeViewport,
  viewportChanged,
  type Viewport,
} from "@/logic/viewport";
import { createStage } from "@/scene/stage";
import { SCENE_LABEL } from "@/ui/copy";
import { createPanelLayer } from "@/ui/panelLayer";
import {
  createAssetSources,
  createLoadingManager,
  loadAssets,
  type LoadedAssets,
} from "./assetLoader";
import { createCameraRig } from "./cameraRig";
import { createInteraction } from "./interaction";
import { createPicker } from "./picker";
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
  // Not in the tab order (keys are heard on the window), but focusable so focus can
  // return here when a panel closes.
  canvas.tabIndex = -1;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", SCENE_LABEL);
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

  const stage = createStage();
  disposer.add(() => {
    stage.dispose();
  });

  const camera = new PerspectiveCamera(50, 1, 0.1, 200);
  const picker = createPicker();
  const { spots } = stage.building;
  for (const marker of spots.markers) picker.register(marker.id, marker.object);
  picker.addOccluders(stage.building.occluders);
  disposer.add(() => {
    picker.dispose();
  });

  // Closing goes back through the state machine, which then syncs the layer.
  const panels = createPanelLayer({
    parent: root,
    onCloseRequest: () => {
      interaction.send({ kind: "close" });
    },
    fallbackFocus: () => canvas,
  });
  disposer.add(() => {
    panels.dispose();
  });

  // The interaction and the rig talk both ways; the rig is only reached once both exist.
  const interaction = createInteraction({
    canvas,
    keyTarget: win,
    camera,
    picker,
    rig: {
      snapTo: (side) => {
        rig.snapTo(side);
      },
      nearestSide: () => rig.nearestSide(),
    },
    highlight: (id) => {
      spots.setHighlighted(id);
    },
    onChange: (state) => {
      panels.sync(state.mode);
    },
  });
  disposer.add(() => {
    interaction.dispose();
  });

  const rig = createCameraRig({
    camera,
    dom: canvas,
    reducedMotion: () => reducedMotion.value,
    onArrive: (side) => {
      // Lets the smoke test (and later the overlays) see which side is in view.
      canvas.dataset.cameraSide = side;
    },
    onFreeLook: () => {
      delete canvas.dataset.cameraSide;
      interaction.send({ kind: "freeLook" });
    },
  });
  disposer.add(() => {
    rig.dispose();
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
