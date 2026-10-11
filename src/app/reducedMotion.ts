export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** The part of `MediaQueryList` this module needs, so tests can pass a fake. */
export type MotionQueryList = {
  readonly matches: boolean;
  addEventListener(
    type: "change",
    listener: (event: { matches: boolean }) => void,
  ): void;
  removeEventListener(
    type: "change",
    listener: (event: { matches: boolean }) => void,
  ): void;
};

export type MatchMedia = (query: string) => MotionQueryList;

export type ReducedMotionSetting = {
  /** True when the visitor asked for reduced motion. */
  readonly value: boolean;
  /** Calls `listener` whenever the preference changes. Returns an unsubscribe function. */
  subscribe(listener: (reduced: boolean) => void): () => void;
  /** Stops listening to the media query and drops all subscribers. */
  dispose(): void;
};

/** Reads `prefers-reduced-motion` and keeps following it while the page is open. */
export function createReducedMotion(
  matchMedia: MatchMedia,
): ReducedMotionSetting {
  const query = matchMedia(REDUCED_MOTION_QUERY);
  const listeners = new Set<(reduced: boolean) => void>();
  let value = query.matches;

  const onChange = (event: { matches: boolean }): void => {
    if (event.matches === value) return;
    value = event.matches;
    for (const listener of listeners) listener(value);
  };
  query.addEventListener("change", onChange);

  return {
    get value() {
      return value;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      query.removeEventListener("change", onChange);
      listeners.clear();
    },
  };
}
