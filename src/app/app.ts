import { PerspectiveCamera } from "three";
import type { SiteContent } from "@/content/types";
import { createDisposer } from "@/logic/disposer";
import { createFrameClock } from "@/logic/frameClock";
import {
  computeViewport,
  viewportChanged,
  type Viewport,
} from "@/logic/viewport";
import { createEnvironment } from "@/scene/atmosphere/environment";
import { createStage } from "@/scene/stage";
import { SCENE_LABEL } from "@/ui/copy";
import { renderCrtPanel } from "@/ui/crtPanel";
import { renderSkillPanel } from "@/ui/skillPanel";
import { createPanelLayer, placeholderPanel } from "@/ui/panelLayer";
import {
  createAssetSources,
  createLoadingManager,
  loadAssets,
  type LoadedAssets,
} from "./assetLoader";
import { createCameraRig } from "./cameraRig";
import { createInteraction } from "./interaction";
import { createPicker } from "./picker";
import { createPostProcessing } from "./postProcessing";
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
  /** The validated site content (`loadContent`). */
  content: SiteContent;
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

  const { profile, skills } = options.content;
  const stage = createStage({
    attract: { name: profile.name, title: profile.title },
    skills,
  });
  disposer.add(() => {
    stage.dispose();
  });

  const environment = createEnvironment(renderer);
  stage.setEnvironment(environment.texture);
  disposer.add(() => {
    stage.setEnvironment(null);
    environment.dispose();
  });

  const camera = new PerspectiveCamera(50, 1, 0.1, 200);
  const post = createPostProcessing(renderer, stage.scene, camera);
  disposer.add(() => {
    post.dispose();
  });
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
    render: (side, doc) => {
      if (side === "front") return renderCrtPanel(profile.aboutPages, doc);
      if (side === "left") return renderSkillPanel(skills, doc);
      return placeholderPanel(side, doc);
    },
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
      goTo: (stop) => {
        rig.goTo(stop);
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
    onArrive: (stop) => {
      // Lets the smoke test (and later the overlays) see which side is in view, and
      // whether the camera is on the side's view or in close (the cabinet's screen).
      canvas.dataset.cameraSide = stop.side;
      canvas.dataset.cameraView = stop.kind;
    },
    onFreeLook: () => {
      delete canvas.dataset.cameraSide;
      delete canvas.dataset.cameraView;
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
    // Sharper textures on the street, seen at a low angle.
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    for (const set of Object.values(loaded.textures))
      for (const map of Object.values(set.maps))
        if (map !== null) map.anisotropy = anisotropy;
    stage.applyTextures(loaded.textures);
    // Fonts have settled (loaded or fallen back), so canvas text can use them.
    stage.redrawText();
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
    post.setSize(next.width, next.height, next.pixelRatio);
    camera.aspect = next.aspect;
    camera.updateProjectionMatrix();
  };

  // Draw calls and triangles on the canvas, for the smoke test and performance checks.
  const showStats = (): void => {
    const { sceneCalls, sceneTriangles, frameCalls } = post.stats();
    const values = {
      drawCalls: String(sceneCalls),
      triangles: String(sceneTriangles),
      frameCalls: String(frameCalls),
    };
    for (const [key, value] of Object.entries(values))
      if (canvas.dataset[key] !== value) canvas.dataset[key] = value;
  };

  const clock = createFrameClock();
  renderer.setAnimationLoop((timeMs) => {
    const dtMs = clock.tick(timeMs);
    resizeIfNeeded();
    rig.update(dtMs);
    stage.update(dtMs, reducedMotion.value);
    post.render(dtMs);
    showStats();
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
