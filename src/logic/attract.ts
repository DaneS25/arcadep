/**
 * The cabinet's attract mode (task 10): "PRESS START" blinks slowly on its screen. Pure
 * timing; the scene redraws the screen only when the answer changes.
 */

export const ATTRACT = {
  /** One full on-and-off cycle: one flash a second, well under the 3-a-second limit. */
  blinkPeriodMs: 1000,
} as const;

/** How many times a second the prompt flashes on. */
export function flashesPerSecond(
  periodMs: number = ATTRACT.blinkPeriodMs,
): number {
  return 1000 / periodMs;
}

/**
 * Whether the prompt shows `elapsedMs` into attract mode: on for the first half of each
 * cycle, off for the second. Under reduced motion it stays on and never blinks.
 */
export function promptVisible(
  elapsedMs: number,
  reducedMotion: boolean,
): boolean {
  if (reducedMotion || !Number.isFinite(elapsedMs) || elapsedMs < 0)
    return true;
  const phase = elapsedMs % ATTRACT.blinkPeriodMs;
  return phase < ATTRACT.blinkPeriodMs / 2;
}
