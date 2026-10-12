import type { PerspectiveCamera } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Side } from "@/logic/buildingLayout";
import { createCameraNavigator } from "@/logic/cameraNavigator";
import {
  CAMERA,
  clampOrbit,
  orbitPosition,
  type Orbit,
} from "@/logic/cameraOrbit";
import { navCommandForKey } from "@/logic/navigationKeys";

export type CameraRig = {
  /** Moves any running snap on by `dtMs`; call once a frame before rendering. */
  update(dtMs: number): void;
  dispose(): void;
};

export type CameraRigOptions = {
  camera: PerspectiveCamera;
  /** The element the mouse drags on (the canvas). */
  dom: HTMLElement;
  /** Where key presses are heard. */
  keyTarget: Window;
  /** Read at the start of each snap: true turns the snap into a cut. */
  reducedMotion: () => boolean;
  /** Called when a snap lands on a side. */
  onArrive?: (side: Side) => void;
  /** Called when the visitor takes the camera with the mouse. */
  onFreeLook?: () => void;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

/**
 * Mouse orbit through OrbitControls, clamped by the limits in `logic/cameraOrbit`, plus
 * arrow keys that snap the camera to the next side round the building.
 */
export function createCameraRig(options: CameraRigOptions): CameraRig {
  const { camera, dom, keyTarget } = options;
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

  const onStart = (): void => {
    navigator.cancel();
    options.onFreeLook?.();
  };
  controls.addEventListener("start", onStart);

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || isTypingTarget(event.target)) return;
    const command = navCommandForKey(event);
    if (command === undefined) return;
    event.preventDefault();
    navigator.turn(currentOrbit(), command.direction, options.reducedMotion());
  };
  keyTarget.addEventListener("keydown", onKeyDown);

  return {
    update(dtMs) {
      const step = navigator.update(dtMs);
      if (step.kind === "idle") return;
      place(step.orbit);
      controls.update();
      if (step.kind === "arrived") options.onArrive?.(step.side);
    },
    dispose() {
      keyTarget.removeEventListener("keydown", onKeyDown);
      controls.removeEventListener("start", onStart);
      controls.dispose();
    },
  };
}
