import { Raycaster, Vector2, type Camera, type Object3D } from "three";
import type { InteractiveId } from "@/logic/interactiveIds";
import type { ScreenPoint } from "@/logic/pointer";

export type Picker = {
  /** Adds an object (and its children) that picking reports as `id`. */
  register(id: InteractiveId, object: Object3D): void;
  /** Adds solid objects that hide registered ones behind them. They never report an id. */
  addOccluders(objects: readonly Object3D[]): void;
  /** The registered id under `ndc`, if the nearest hit is a registered object. */
  pick(ndc: ScreenPoint, camera: Camera): InteractiveId | undefined;
  dispose(): void;
};

/**
 * One shared Raycaster tested against an explicit list of objects: the registered
 * interactive ones plus a few occluders, never the whole scene.
 */
export function createPicker(): Picker {
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const ids = new Map<Object3D, InteractiveId>();
  const targets: Object3D[] = [];

  const idOf = (object: Object3D): InteractiveId | undefined => {
    // A hit can land on a child of a registered prop, so walk up to the registered root.
    for (let o: Object3D | null = object; o !== null; o = o.parent) {
      const id = ids.get(o);
      if (id !== undefined) return id;
    }
    return undefined;
  };

  return {
    register(id, object) {
      ids.set(object, id);
      targets.push(object);
    },
    addOccluders(objects) {
      targets.push(...objects);
    },
    pick(ndc, camera) {
      pointer.set(ndc.x, ndc.y);
      raycaster.setFromCamera(pointer, camera);
      const [nearest] = raycaster.intersectObjects(targets, true);
      return nearest === undefined ? undefined : idOf(nearest.object);
    },
    dispose() {
      ids.clear();
      targets.length = 0;
    },
  };
}
