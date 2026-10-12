import type { Camera } from "three";
import {
  INITIAL_STATE,
  highlightedId,
  transition,
  type AppEvent,
  type AppState,
} from "@/logic/appState";
import type { InteractiveId } from "@/logic/interactiveIds";
import { eventForCommand, navCommandForKey } from "@/logic/navigationKeys";
import { isClick, toNdc, type ScreenPoint } from "@/logic/pointer";
import type { CameraRig } from "./cameraRig";
import type { Picker } from "./picker";

export type Interaction = {
  readonly state: AppState;
  /** Feeds an event from elsewhere in the app (for example the camera's free look). */
  send(event: AppEvent): void;
  dispose(): void;
};

export type InteractionOptions = {
  /** The canvas: pointer events are heard here and state is mirrored on it. */
  canvas: HTMLCanvasElement;
  /** Where key presses are heard. */
  keyTarget: Window;
  camera: Camera;
  picker: Picker;
  /** Where camera snaps go (the camera rig). */
  rig: Pick<CameraRig, "snapTo" | "nearestSide">;
  /** Lights up the hovered or focused object. */
  highlight: (id: InteractiveId | undefined) => void;
  /** Hears every state change (the overlay panel layer follows the mode). */
  onChange: (state: AppState) => void;
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
 * Wires the keyboard and pointer to the app state machine and applies what it decides:
 * camera snaps, the highlight, and `data-app-*` attributes on the canvas (read by the
 * smoke test). Overlays follow through `onChange`; scene code never opens UI.
 */
export function createInteraction(options: InteractionOptions): Interaction {
  const { canvas, keyTarget, camera, picker, rig } = options;
  let state = INITIAL_STATE;

  const mirror = (): void => {
    const { mode } = state;
    canvas.dataset.appState = mode.kind;
    if (mode.kind === "exploring") delete canvas.dataset.appSide;
    else canvas.dataset.appSide = mode.side;
    if (state.hovered === undefined) delete canvas.dataset.hover;
    else canvas.dataset.hover = state.hovered;
    canvas.style.cursor = state.hovered === undefined ? "" : "pointer";
    options.highlight(highlightedId(state));
    options.onChange(state);
  };

  const send = (event: AppEvent): boolean => {
    const next = transition(state, event);
    const changed = next.state !== state;
    state = next.state;
    if (next.snapTo !== undefined) rig.snapTo(next.snapTo);
    if (changed) mirror();
    return next.handled;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || isTypingTarget(event.target)) return;
    const command = navCommandForKey(event);
    if (command === undefined) return;
    if (send(eventForCommand(command, rig.nearestSide()))) {
      event.preventDefault();
    }
  };

  const pickAt = (event: PointerEvent): InteractiveId | undefined => {
    const ndc = toNdc(
      { x: event.clientX, y: event.clientY },
      canvas.getBoundingClientRect(),
    );
    return ndc === undefined ? undefined : picker.pick(ndc, camera);
  };

  const onPointerMove = (event: PointerEvent): void => {
    // Mid-drag the camera is orbiting; hover only follows a free pointer.
    if (event.buttons !== 0) return;
    const id = pickAt(event);
    if (id !== state.hovered) send({ kind: "hover", id });
  };

  const onPointerLeave = (): void => {
    if (state.hovered !== undefined) send({ kind: "hover", id: undefined });
  };

  let down: ScreenPoint | undefined;
  const onPointerDown = (event: PointerEvent): void => {
    down =
      event.button === 0 ? { x: event.clientX, y: event.clientY } : undefined;
  };
  const onPointerUp = (event: PointerEvent): void => {
    const start = down;
    down = undefined;
    if (start === undefined || event.button !== 0) return;
    if (!isClick(start, { x: event.clientX, y: event.clientY })) return;
    const id = pickAt(event);
    if (id !== undefined) send({ kind: "activate", id });
  };

  keyTarget.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  mirror();

  return {
    get state() {
      return state;
    },
    send(event) {
      send(event);
    },
    dispose() {
      keyTarget.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
    },
  };
}
