import type { PerspectiveCamera } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Side } from "@/logic/buildingLayout";
import { createCameraNavigator } from "@/logic/cameraNavigator";
import {
  CAMERA,
  clampOrbit,
  nearestSide,
  posePosition,
  type CameraPose,
  type Orbit,
} from "@/logic/cameraOrbit";
import type { CameraStop } from "@/logic/cameraStops";

export type CameraRig = {
  /** Starts a move (or, under reduced motion, a cut) to a side's view or a close-up. */
  goTo(stop: CameraStop): void;
  /** The side the camera currently faces most (the close-up's side while close up). */
  nearestSide(): Side;
  /** Moves any running move on by `dtMs`; call once a frame before rendering. */
  update(dtMs: number): void;
  dispose(): void;
};

export type CameraRigOptions = {
  camera: PerspectiveCamera;
  /** The element the mouse drags on (the canvas). */
  dom: HTMLElement;
  /** Read at the start of each move: true turns the move into a cut. */
  reducedMotion: () => boolean;
  /** Called when a move lands on its stop. */
  onArrive?: (stop: CameraStop) => void;
  /** Called when the visitor takes the camera with the mouse. */
  onFreeLook?: () => void;
};

/**
 * Mouse orbit through OrbitControls, clamped by the limits in `logic/cameraOrbit`, plus
 * moves to a side's view or a close-up. Which stop to go to is the app state machine's
 * call. While the camera is in close (or on its way in or out) it is off the building's
 * orbit, so the mouse orbit is switched off until it lands on a side again.
 */
export function createCameraRig(options: CameraRigOptions): CameraRig {
  const { camera, dom } = options;
  const target = CAMERA.target;

  const controls = new OrbitControls(camera, dom);
  controls.target.set(target.x, target.y, target.z);
  controls.enablePan = false;
  controls.enableDamping = false;
  controls.minPolarAngle = CAMERA.minPolarRad;
  controls.maxPolarAngle = CAMERA.maxPolarRad;
  controls.minDistance = CAMERA.minDistanceM;
  controls.maxDistance = CAMERA.maxDistanceM;

  const place = (pose: CameraPose): void => {
    const p = posePosition(pose);
    camera.position.set(p.x, p.y, p.z);
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
  };

  const currentOrbit = (): Orbit =>
    clampOrbit({
      azimuthRad: controls.getAzimuthalAngle(),
      polarRad: controls.getPolarAngle(),
      distanceM: controls.getDistance(),
    });

  place({ target, orbit: CAMERA.start });
  controls.update();

  const navigator = createCameraNavigator();

  // The camera only counts as taken by the mouse once a drag actually moves it, so a
  // still click (picking a spot) keeps the focus and any running snap.
  let pressed = false;
  let applyingSnap = false;

  // Off the building's orbit: in close, or moving in or out. `pose` is where it was last put.
  let detached: { side: Side; pose: CameraPose | undefined } | undefined;

  const reattach = (): void => {
    detached = undefined;
    controls.target.set(target.x, target.y, target.z);
    controls.enabled = true;
    applyingSnap = true;
    controls.update();
    applyingSnap = false;
  };

  const onStart = (): void => {
    pressed = true;
  };
  const onEnd = (): void => {
    pressed = false;
  };
  const onChange = (): void => {
    if (!pressed || applyingSnap) return;
    pressed = false;
    navigator.cancel();
    options.onFreeLook?.();
  };
  controls.addEventListener("start", onStart);
  controls.addEventListener("end", onEnd);
  controls.addEventListener("change", onChange);

  return {
    goTo(stop) {
      const from: CameraPose = detached?.pose ?? {
        target,
        orbit: currentOrbit(),
      };
      if (stop.kind === "closeUp") {
        detached = { side: stop.side, pose: detached?.pose };
        controls.enabled = false;
        pressed = false;
      }
      navigator.goTo(from, stop, options.reducedMotion());
    },
    nearestSide() {
      return detached?.side ?? nearestSide(currentOrbit().azimuthRad);
    },
    update(dtMs) {
      const step = navigator.update(dtMs);
      if (step.kind === "idle") return;
      place(step.pose);
      if (detached !== undefined) {
        detached.pose = step.pose;
        if (step.kind === "arrived" && step.stop.kind === "side") reattach();
      } else {
        applyingSnap = true;
        controls.update();
        applyingSnap = false;
      }
      if (step.kind === "arrived") options.onArrive?.(step.stop);
    },
    dispose() {
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
      controls.removeEventListener("change", onChange);
      controls.dispose();
    },
  };
}
