import { describe, expect, it } from "vitest";
import { buildingHeightM, pavementY, type Vec3 } from "./buildingLayout";
import {
  VERTICES_PER_BOX,
  detailLayout,
  type DetailLayout,
} from "./detailLayout";
import { withDucts } from "./ductLayout";
import { housingTopY, withGenerator } from "./generatorLayout";
import { LED_LOOK } from "./lookConfig";
import {
  FLASH_BUDGET,
  FLICKER,
  FLICKER_CYCLE_MS,
  maxFlashesPerSecond,
} from "./neonFlicker";
import { PALETTE } from "./palette";
import {
  TAPS,
  blinkingLedStarts,
  darkLed,
  strandPoint,
  tapDevices,
  tapLeds,
  withTaps,
} from "./tapLayout";
import { dimmedWindow, flickeringPanes, windowLayout } from "./windowLayout";
import { wireStrands, withWires } from "./wireLayout";

const devices = tapDevices();
const strands = wireStrands();

/** The shortest distance from `p` to a strand's polyline. */
function distanceToStrand(p: Vec3, points: readonly Vec3[]): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const len2 = d.x * d.x + d.y * d.y + d.z * d.z;
    const t =
      len2 > 0
        ? Math.min(
            1,
            Math.max(
              0,
              ((p.x - a.x) * d.x + (p.y - a.y) * d.y + (p.z - a.z) * d.z) /
                len2,
            ),
          )
        : 0;
    best = Math.min(
      best,
      Math.hypot(
        p.x - (a.x + d.x * t),
        p.y - (a.y + d.y * t),
        p.z - (a.z + d.z * t),
      ),
    );
  }
  return best;
}

describe("strandPoint", () => {
  it("runs from a strand's first point to its last, along it", () => {
    const strand = strands[0];
    if (!strand) throw new Error("no strands");
    expect(strandPoint(strand, 0)).toEqual(strand.points[0]);
    const end = strandPoint(strand, 1);
    const last = strand.points.at(-1);
    expect(last).toBeDefined();
    if (last)
      expect(
        Math.hypot(end.x - last.x, end.y - last.y, end.z - last.z),
      ).toBeLessThan(1e-9);
    for (const t of [0.1, 0.37, 0.8])
      expect(
        distanceToStrand(strandPoint(strand, t), strand.points),
      ).toBeLessThan(1e-9);
  });
});

describe("tapDevices", () => {
  it("has the brief's finds: a junction box, a taped box, a dangling modem, clips, an antenna and the generator", () => {
    expect(devices.map((d) => d.id)).toEqual([
      "front-junction",
      "front-taped",
      "right-modem",
      "generator-tap",
    ]);
    // Clips (small metal boxes) and antennas (beams rising from a device).
    const clipBoxes = devices.flatMap((d) =>
      d.boxes.filter(
        (b) =>
          Math.abs(b.box.size.y - TAPS.clip.up) < 1e-9 && b.kind === "metal",
      ),
    );
    expect(clipBoxes.length).toBeGreaterThanOrEqual(4);
    const antennas = devices.flatMap((d) =>
      d.beams.filter((b) => b.thicknessM === TAPS.antennaM),
    );
    expect(antennas.length).toBeGreaterThanOrEqual(2);
    for (const a of antennas) expect(a.to.y - a.from.y).toBeGreaterThan(0.2);
  });

  it("hacks into the wires: each device holds on to a point on its strand", () => {
    for (const d of devices) {
      const strand = strands.find((s) => s.run === d.run);
      expect(strand, d.id).toBeDefined();
      if (!strand) continue;
      if (d.id === "generator-tap") {
        // On the generator's housing, its clip on the feed just above the port.
        expect(d.at.y).toBeGreaterThan(housingTopY());
        expect(d.at.y).toBeLessThan(housingTopY() + 0.2);
        const clipEnds = d.beams
          .filter((b) => b.thicknessM === TAPS.leadM)
          .map((b) => b.from);
        expect(clipEnds.length).toBeGreaterThan(0);
        for (const p of clipEnds)
          expect(distanceToStrand(p, strand.points), d.id).toBeLessThan(1e-6);
      } else {
        expect(distanceToStrand(d.at, strand.points), d.id).toBeLessThan(1e-6);
        // Every lead starts on the wire.
        for (const b of d.beams.filter((b) => b.thicknessM === TAPS.leadM))
          expect(distanceToStrand(b.from, strand.points), d.id).toBeLessThan(
            1e-6,
          );
      }
    }
  });

  it("is small: a find on close inspection, every part within half a metre of its hold", () => {
    for (const d of devices) {
      for (const { box } of [...d.boxes, ...d.leds]) {
        expect(
          Math.max(box.size.x, box.size.y, box.size.z),
          d.id,
        ).toBeLessThanOrEqual(0.26);
        expect(
          Math.hypot(
            box.centre.x - d.at.x,
            box.centre.y - d.at.y,
            box.centre.z - d.at.z,
          ),
          d.id,
        ).toBeLessThan(0.5);
      }
      for (const b of d.beams)
        expect(
          Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y, b.to.z - b.from.z),
          d.id,
        ).toBeLessThan(0.5);
    }
    for (const { box } of tapLeds(devices))
      expect(Math.max(box.size.x, box.size.y, box.size.z)).toBeLessThanOrEqual(
        TAPS.ledM + 1e-9,
      );
  });

  it("stays over the pavement and under the roof", () => {
    for (const d of devices)
      for (const { box } of [...d.boxes, ...d.leds]) {
        expect(box.centre.y - box.size.y / 2).toBeGreaterThan(
          pavementY() + 2.5,
        );
        expect(box.centre.y + box.size.y / 2).toBeLessThan(buildingHeightM());
      }
  });
});

describe("the taps' LEDs", () => {
  const leds = tapLeds(devices);

  it("glow in the palette's red, cyan and purple, never yellow or amber", () => {
    expect(LED_LOOK).toEqual({
      red: PALETTE.accent,
      cyan: PALETTE.cyan,
      purple: PALETTE.purple,
    });
    expect(new Set(leds.map((l) => l.glow))).toEqual(
      new Set(["red", "cyan", "purple"]),
    );
  });

  it("blink on the front and right only; the generator's stay steady by the flickering skill signs", () => {
    const blinking = devices.flatMap((d) =>
      d.leds.filter((l) => l.blink === true).map(() => d.id),
    );
    expect(blinking.length).toBeGreaterThanOrEqual(3);
    expect(blinking).not.toContain("generator-tap");
    for (const l of devices.find((d) => d.id === "generator-tap")?.leds ?? [])
      expect(l.blink).toBeUndefined();
  });
});

describe("darkLed", () => {
  const leds = tapLeds(devices).filter((l) => l.blink === true).length;
  const windows = flickeringPanes(windowLayout().glass).length;

  it("never blinks under reduced motion", () => {
    for (let t = 0; t < 20_000; t += 7)
      expect(darkLed(t, leds, true)).toBeUndefined();
  });

  it("darkens at most one LED a slot, for its first 200 ms, and does blink", () => {
    let blinks = 0;
    for (let slot = 0; slot < 500; slot += 1) {
      const start = slot * FLICKER.slotMs;
      const first = darkLed(start, leds, false);
      if (first !== undefined) blinks += 1;
      for (let t = start; t < start + FLICKER.slotMs; t += 10) {
        const d = darkLed(t, leds, false);
        if (t - start < FLASH_BUDGET.dipMs.taps) expect(d).toBe(first);
        else expect(d).toBeUndefined();
      }
    }
    expect(blinks).toBeGreaterThan(100);
  });

  it("never blinks in a window's slot, so taps and windows together stay at 3 flashes a second", () => {
    // Count every flash (a light going dark) of the windows and the LEDs together.
    const darkAt = (t: number): string | undefined => {
      const w = dimmedWindow(t, windows, false);
      const l = darkLed(t, leds, false);
      if (w !== undefined && l !== undefined)
        throw new Error(`both at ${String(t)}`);
      return w !== undefined
        ? `w${String(w)}`
        : l !== undefined
          ? `l${String(l)}`
          : undefined;
    };
    const flashes: number[] = [];
    let previous: string | undefined;
    const span = 120_000;
    for (let t = 0; t < span; t += 10) {
      const now = darkAt(t);
      if (now !== undefined && now !== previous) flashes.push(t);
      previous = now;
    }
    expect(flashes.length).toBeGreaterThan(100);
    let worst = 0;
    for (let i = 0, j = 0; i < flashes.length; i += 1) {
      while ((flashes[i] ?? 0) - (flashes[j] ?? 0) >= 1000) j += 1;
      worst = Math.max(worst, i - j + 1);
    }
    expect(worst).toBeLessThanOrEqual(maxFlashesPerSecond());
    expect(maxFlashesPerSecond()).toBe(3);
  });

  it("repeats with the flicker cycle and ignores bad input", () => {
    expect(darkLed(-1, leds, false)).toBeUndefined();
    expect(darkLed(Number.NaN, leds, false)).toBeUndefined();
    expect(darkLed(100, 0, false)).toBeUndefined();
    for (let t = 0; t < 5000; t += 50)
      expect(darkLed(t + FLICKER_CYCLE_MS, leds, false)).toBe(
        darkLed(t, leds, false),
      );
  });
});

describe("withTaps", () => {
  it("adds the devices' boxes, then their LEDs, after the layout's, and their beams after its beams", () => {
    const base: DetailLayout = withWires(
      withGenerator(withDucts(detailLayout())),
    );
    const tapped = withTaps(base);
    const boxes = devices.flatMap((d) => d.boxes);
    expect(tapped.boxes.slice(0, base.boxes.length)).toEqual(base.boxes);
    expect(
      tapped.boxes.slice(base.boxes.length, base.boxes.length + boxes.length),
    ).toEqual(boxes);
    expect(tapped.boxes.slice(base.boxes.length + boxes.length)).toEqual(
      tapLeds(devices),
    );
    expect(tapped.beams.slice(0, base.beams.length)).toEqual(base.beams);
    expect(tapped.faces).toEqual(base.faces);
  });

  it("finds each blinking LED's first vertex for the scene to switch", () => {
    const tapped = withTaps(
      withWires(withGenerator(withDucts(detailLayout()))),
    );
    const starts = blinkingLedStarts(tapped);
    expect(starts).toHaveLength(
      tapLeds(devices).filter((l) => l.blink === true).length,
    );
    for (const start of starts) {
      const part = tapped.boxes[start / VERTICES_PER_BOX];
      expect(part?.kind).toBe("led");
      expect(part?.blink).toBe(true);
    }
  });
});
