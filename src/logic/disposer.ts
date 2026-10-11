export type Disposer = {
  /** Registers a clean-up step. Steps run in reverse order of registration. */
  add(dispose: () => void): void;
  /** Runs every step once. Later calls do nothing. */
  dispose(): void;
  readonly disposed: boolean;
};

/** Collects clean-up steps so a module can release everything it created in one call. */
export function createDisposer(): Disposer {
  const steps: (() => void)[] = [];
  let disposed = false;

  return {
    add(step) {
      if (disposed) {
        step();
        return;
      }
      steps.push(step);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (let step = steps.pop(); step !== undefined; step = steps.pop())
        step();
    },
    get disposed() {
      return disposed;
    },
  };
}
