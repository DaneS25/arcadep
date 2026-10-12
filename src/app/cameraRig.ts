import type { PerspectiveCamera } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Side } from "@/logic/buildingLayout";
import { createCameraNavigator } from "@/logic/cameraNavigator";
import {
  CAMERA,
  clampOrbit,
  nearestSide,
  orbitPosition,
  type Orbit,
} from "@/logic/cameraOrbit";

export type CameraRig = {
  /** Starts a snap (or, under reduced motion, a cut) to `side`'s view. */
  snapTo(side: Side): void;
  /** The side the camera currently faces most. */
  nearestSide(): Side;
  /** Moves any running snap on by `dtMs`; call once a frame before rendering. */
  update(dtMs: number): void;
  dispose(): void;
};

export type CameraRigOptions = {
  camera: PerspectiveCamera;
  /** The element the mouse drags on (the canvas). */
  dom: HTMLElement;
  /** Read at the start of each snap: true turns the snap into a cut. */
  reducedMotion: () => boolean;
  /** Called when a snap lands on a side. */
  onArrive?: (side: Side) => void;
  /** Called when the visitor takes the camera with the mouse. */
  onFreeLook?: () => void;
};

/**
 * Mouse orbit through OrbitControls, clamped by the limits in `logic/cameraOrbit`, plus
 * snaps to a side's view. Which side to snap to is the app state machine's call.
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

  const place = (orbit: Orbit): void => {
    const p = orbitPosition(orbit, target);
    camera.position.set(p.x, p.y, p.z);
    camera.lookAt(target.x, target.y, target.z);
  };

  const currentOrbit = (): Orbit =>
    clampOrbit({
      azimuthRad: controls.getAzimuthalAngle(),
      polarRad: controls.getPolarAngle(),
      distanceM: controls.getDistance(),
    });

  place(CAMERA.start);
  controls.update();

  const navigator = createCameraNavigator();

  // The camera only counts as taken by the mouse once a drag actually moves it, so a
  // still click (picking a spot) keeps the focus and any running snap.
  let pressed = false;
  let applyingSnap = false;
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
    snapTo(side) {
      navigator.goTo(currentOrbit(), side, options.reducedMotion());
    },
    nearestSide() {
      return nearestSide(currentOrbit().azimuthRad);
    },
    update(dtMs) {
      const step = navigator.update(dtMs);
      if (step.kind === "idle") return;
      place(step.orbit);
      applyingSnap = true;
      controls.update();
      applyingSnap = false;
      if (step.kind === "arrived") options.onArrive?.(step.side);
    },
    dispose() {
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
      controls.removeEventListener("change", onChange);
      controls.dispose();
    },
  };
}
