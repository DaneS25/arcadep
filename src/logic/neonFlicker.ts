/**
 * The neon skill signs' gentle flicker (task 11): now and then one sign dips dim for a
 * moment. Pure, seeded and deterministic, so the same seed and time always give the same
 * answer and the flash limit can be proved in tests.
 *
 * Time is cut into slots. A dip can only start at the start of a slot and is shorter than
 * one, and at most one sign in the whole cluster dips per slot. Any one-second window holds
 * at most `ceil(1000 / slotMs)` slot starts, so the cluster as a whole never flashes more
 * than that many times a second (3 with the 400 ms slot, the WCAG three-flash limit).
 * Under reduced motion nothing dips and every sign stays steady.
 */

export const FLICKER = {
  /** Length of one slot; at most one dip starts in each. */
  slotMs: 400,
  /** How long a dip lasts, from the start of its slot. */
  dipMs: 90,
  /** Chance that a slot has a dip at all. */
  dipChance: 0.18,
  /** Brightness of a dipped sign; the others stay at 1. */
  dimLevel: 0.3,
  /** Slots before the pattern repeats; keeps the slot index (and the clock) bounded. */
  cycleSlots: 1500,
} as const;

/** Most flashes (on to dim) in any one-second window, for the whole cluster. */
export function maxFlashesPerSecond(slotMs: number = FLICKER.slotMs): number {
  return Math.ceil(1000 / slotMs);
}

/** The length of one full flicker pattern; the scene keeps its clock inside it. */
export const FLICKER_CYCLE_MS = FLICKER.slotMs * FLICKER.cycleSlots;

/** A 32-bit integer hash of a seed and a slot (a small avalanche mix). */
function hash(seed: number, slot: number): number {
  let h = (Math.trunc(seed) ^ Math.imul(slot + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** A stable seed from text (a skill id, say): FNV-1a. */
export function seedFromText(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

/**
 * The index of the sign dipped `timeMs` into the pattern, among `count` signs, or
 * undefined when every sign is fully lit. Always undefined under reduced motion.
 */
export function dimmedSign(
  timeMs: number,
  seed: number,
  count: number,
  reducedMotion: boolean,
): number | undefined {
  if (reducedMotion || count <= 0 || !Number.isFinite(timeMs) || timeMs < 0)
    return undefined;
  const slot = Math.floor(timeMs / FLICKER.slotMs) % FLICKER.cycleSlots;
  const intoSlot = timeMs % FLICKER.slotMs;
  if (intoSlot >= FLICKER.dipMs) return undefined;
  const h = hash(seed, slot);
  // The low 16 bits decide whether the slot dips, the high 16 bits which sign.
  if ((h & 0xffff) / 0x10000 >= FLICKER.dipChance) return undefined;
  return (h >>> 16) % Math.trunc(count);
}

/** Brightness of every sign `timeMs` into the pattern: 1, or `dimLevel` for the dipped one. */
export function flickerLevels(
  timeMs: number,
  seed: number,
  count: number,
  reducedMotion: boolean,
): number[] {
  const dimmed = dimmedSign(timeMs, seed, count, reducedMotion);
  return Array.from({ length: Math.max(0, Math.trunc(count)) }, (_, i) =>
    i === dimmed ? FLICKER.dimLevel : 1,
  );
}
