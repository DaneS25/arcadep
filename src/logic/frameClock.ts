/** Longest frame step the scene will simulate, so a tab switch doesn't make things jump. */
export const MAX_FRAME_DT_MS = 100;

/** Clamps a raw frame delta to `[0, maxDtMs]`. Non-finite input counts as 0. */
export function clampDeltaMs(
  rawDtMs: number,
  maxDtMs: number = MAX_FRAME_DT_MS,
): number {
  if (!Number.isFinite(rawDtMs) || rawDtMs <= 0) return 0;
  return Math.min(rawDtMs, maxDtMs);
}

export type FrameClock = {
  /** Takes the loop's timestamp and returns the clamped time since the previous tick. */
  tick(timeMs: number): number;
  /** Forgets the previous timestamp, so the next tick returns 0. */
  reset(): void;
};

/** The single clock that turns render-loop timestamps into clamped `dtMs` values. */
export function createFrameClock(
  maxDtMs: number = MAX_FRAME_DT_MS,
): FrameClock {
  let lastTimeMs: number | undefined;

  return {
    tick(timeMs) {
      const dtMs =
        lastTimeMs === undefined
          ? 0
          : clampDeltaMs(timeMs - lastTimeMs, maxDtMs);
      lastTimeMs = timeMs;
      return dtMs;
    },
    reset() {
      lastTimeMs = undefined;
    },
  };
}
