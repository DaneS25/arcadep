/**
 * Every flicker in the scene (task 11's skill signs, task 20's windows, task 33's tap LEDs
 * and task 34's small lights) shares one flash budget. Pure, seeded and deterministic, so
 * the same time always gives the same answer and the flash limit can be proved in tests.
 *
 * Time is cut into slots. Each slot has at most one owner (`slotOwner`): one group of
 * flickering things, picked by a seeded hash shared by the whole scene, and in it one
 * member (picked by the group's own seed) dips for the first part of the slot. So at most
 * one flash starts per slot anywhere, and any one-second window holds at most
 * `ceil(1000 / slotMs)` slot starts: nothing in any view, from any side or corner, ever
 * flashes more than 3 times a second together (the WCAG three-flash limit, task 34
 * review). Under reduced motion nothing dips.
 */

export const FLICKER = {
  /** Length of one slot; at most one dip starts in each. */
  slotMs: 400,
  /** How long a dip lasts, from the start of its slot. */
  dipMs: 90,
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

/** The groups that share the flash budget. */
export type FlashGroup = "signs" | "windows" | "taps" | "lights";

/**
 * Who may flash in a slot: each group's share of the slots (the rest have no flash), and
 * how long its dip lasts from the slot's start (always shorter than a slot).
 */
export const FLASH_BUDGET = {
  seed: 0x3c6ef372,
  share: { signs: 0.13, windows: 0.13, taps: 0.22, lights: 0.2 },
  dipMs: {
    signs: FLICKER.dipMs,
    windows: FLICKER.dipMs,
    taps: 200,
    lights: 120,
  },
} as const satisfies {
  seed: number;
  share: Record<FlashGroup, number>;
  dipMs: Record<FlashGroup, number>;
};

const GROUPS: readonly FlashGroup[] = ["signs", "windows", "taps", "lights"];

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

/** The group that owns slot `slot`, if any: the one group allowed to flash in it. */
export function slotOwner(slot: number): FlashGroup | undefined {
  let u = hash(FLASH_BUDGET.seed, slot) / 0x100000000;
  for (const group of GROUPS) {
    u -= FLASH_BUDGET.share[group];
    if (u < 0) return group;
  }
  return undefined;
}

/**
 * The index of the member of `group` (among `count`, picked by its own `seed`) dipped
 * `timeMs` into the pattern, or undefined when none is. Always undefined under reduced
 * motion.
 */
export function flashing(
  timeMs: number,
  group: FlashGroup,
  seed: number,
  count: number,
  reducedMotion: boolean,
): number | undefined {
  if (reducedMotion || count <= 0 || !Number.isFinite(timeMs) || timeMs < 0)
    return undefined;
  const slot = Math.floor(timeMs / FLICKER.slotMs) % FLICKER.cycleSlots;
  if (timeMs % FLICKER.slotMs >= FLASH_BUDGET.dipMs[group]) return undefined;
  if (slotOwner(slot) !== group) return undefined;
  return hash(seed, slot) % Math.trunc(count);
}

/**
 * The index of the skill sign dipped `timeMs` into the pattern, among `count` signs, or
 * undefined when every sign is fully lit. Always undefined under reduced motion.
 */
export function dimmedSign(
  timeMs: number,
  seed: number,
  count: number,
  reducedMotion: boolean,
): number | undefined {
  return flashing(timeMs, "signs", seed, count, reducedMotion);
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
