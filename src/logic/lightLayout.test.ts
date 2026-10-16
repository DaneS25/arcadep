import { describe, expect, it } from "vitest";
import {
  DOOR,
  SIDES,
  openingRect,
  pavementY,
  sideOffsetM,
  sideNormal,
  wallOpenings,
  type Side,
} from "./buildingLayout";
import { relativeLuminance } from "./contrast";
import {
  VERTICES_PER_BOX,
  detailLayout,
  faceVertexStarts,
  type DetailLayout,
} from "./detailLayout";
import { withDucts } from "./ductLayout";
import { withGenerator } from "./generatorLayout";
import {
  LIGHTS,
  cutOutLight,
  flickeringLightVertices,
  paintClearRects,
  smallLights,
  withLights,
} from "./lightLayout";
import { BLOOM, DETAILS_LOOK, LED_LOOK, LIGHTS_LOOK } from "./lookConfig";
import {
  FLASH_BUDGET,
  FLICKER,
  dimmedSign,
  maxFlashesPerSecond,
  type FlashGroup,
} from "./neonFlicker";
import { PALETTE } from "./palette";
import { darkLed, tapDevices, tapLeds } from "./tapLayout";
import {
  BACK_PAINT_OUT_M,
  dimmedWindow,
  flickeringPanes,
  windowLayout,
} from "./windowLayout";

const lights = smallLights();

/** A side's wall coordinate (out from the wall) of a point. */
const outOf = (side: Side, p: { x: number; z: number }): number => {
  const n = sideNormal(side);
  return p.x * n.x + p.z * n.z - sideOffsetM(side);
};

/** The hue of a hex colour, in degrees. */
function hue(hex: string): number {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = v;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe("smallLights", () => {
  it("puts at least one light on every side: a strip, bulbs, an exit sign and a neon fragment", () => {
    for (const side of SIDES)
      expect(
        lights.some((l) => l.side === side),
        side,
      ).toBe(true);
    expect(new Set(lights.map((l) => l.kind))).toEqual(
      new Set(["strip", "bulb", "exit", "neon"]),
    );
    // Some flicker irregularly, and at least one holds steady.
    expect(lights.filter((l) => l.flicker).length).toBeGreaterThanOrEqual(3);
    expect(lights.some((l) => !l.flicker)).toBe(true);
  });

  it("keeps every part small and close to its wall, over the ground floor's openings", () => {
    for (const l of lights)
      for (const { box } of [...l.boxes, ...l.glows]) {
        expect(
          Math.max(box.size.x, box.size.y, box.size.z),
          l.id,
        ).toBeLessThanOrEqual(1.1);
        const out = outOf(l.side, box.centre);
        expect(out, l.id).toBeGreaterThan(0);
        expect(out + Math.min(box.size.x, box.size.z) / 2, l.id).toBeLessThan(
          0.25,
        );
        expect(box.centre.y - box.size.y / 2, l.id).toBeGreaterThan(
          pavementY() + DOOR.heightM,
        );
      }
  });

  it("glows on its own patch: bulbs and tubes in cold light, the fragment in the palette's purple", () => {
    for (const l of lights)
      for (const g of l.glows) {
        expect(g.kind).toBe("light");
        expect(["bulb", "tube", "purple"]).toContain(g.glow);
        expect(g.blink === true, l.id).toBe(l.flicker);
      }
    expect(LED_LOOK.purple).toBe(PALETTE.purple);
  });

  it("is never yellow or amber, never blooms, and stays dimmer than the main signs' red", () => {
    const sign = relativeLuminance(PALETTE.accent) ?? Number.NaN;
    for (const color of [...Object.values(LIGHTS_LOOK), LED_LOOK.purple]) {
      const h = hue(color);
      expect(h < 20 || h > 75, color).toBe(true);
      const lum = relativeLuminance(color) ?? Number.NaN;
      expect(lum * DETAILS_LOOK.emissiveIntensity, color).toBeLessThan(
        BLOOM.threshold,
      );
      expect(lum, color).toBeLessThanOrEqual(sign);
    }
  });

  it("hangs the exit sign over a back door, its lettering facing the alley", () => {
    const exit = lights.find((l) => l.kind === "exit");
    expect(exit?.face?.sign).toBe("exit");
    const door = wallOpenings().find(
      (o) =>
        o.kind === "door" &&
        o.side === exit?.side &&
        exit.face !== undefined &&
        Math.abs(
          o.alongM -
            -(exit.face.quad.corners[0].x + exit.face.quad.corners[1].x) / 2,
        ) < 0.05,
    );
    expect(door).toBeDefined();
    const ys = exit?.face?.quad.corners.map((c) => c.y) ?? [];
    if (door) expect(Math.min(...ys)).toBeGreaterThan(openingRect(door).maxY);
    expect(exit?.face?.quad.normal).toEqual(sideNormal("back"));
    expect(LIGHTS.exit.faceAcross).toBeLessThan(LIGHTS.exit.across);
    // Flat on the wall, behind the paint layer (so it blocks no view of a poster), with
    // the graffiti wiped clear round it so it still shows.
    expect(LIGHTS.exit.out + 0.002).toBeLessThan(BACK_PAINT_OUT_M);
    const [clear] = paintClearRects("back");
    const face = exit?.face?.quad.corners ?? [];
    for (const c of face) {
      expect(-c.x).toBeGreaterThan(clear?.minAlong ?? Infinity);
      expect(-c.x).toBeLessThan(clear?.maxAlong ?? -Infinity);
      expect(c.y).toBeGreaterThan(clear?.minY ?? Infinity);
      expect(c.y).toBeLessThan(clear?.maxY ?? -Infinity);
    }
  });
});

describe("withLights", () => {
  const base: DetailLayout = withGenerator(withDucts(detailLayout()));
  const lit = withLights(base);

  it("adds the housings, then the glowing parts, after the layout's boxes, and the exit face last", () => {
    const housings = lights.flatMap((l) => l.boxes);
    const glows = lights.flatMap((l) => l.glows);
    expect(lit.boxes).toEqual([...base.boxes, ...housings, ...glows]);
    expect(lit.faces.slice(0, base.faces.length)).toEqual(base.faces);
    expect(lit.faces.at(-1)?.sign).toBe("exit");
    expect(lit.beams).toEqual(base.beams);
  });

  it("finds the vertices to switch for each flickering light, from a fresh list of lights", () => {
    const found = flickeringLightVertices(lit, smallLights());
    expect(found).toHaveLength(lights.filter((l) => l.flicker).length);
    const faceStarts = faceVertexStarts(lit);
    for (const [i, l] of lights.filter((x) => x.flicker).entries()) {
      const v = found[i];
      if (l.kind === "exit") {
        expect(v?.faceStart).toBe(faceStarts.at(-1));
        expect(v?.boxStarts).toEqual([]);
      } else {
        expect(v?.boxStarts.length).toBe(l.glows.length);
        for (const start of v?.boxStarts ?? [])
          expect(lit.boxes[start / VERTICES_PER_BOX]?.kind).toBe("light");
      }
    }
  });
});

describe("the scene's one flash budget (task 34)", () => {
  const counts: Record<FlashGroup, number> = {
    signs: 6,
    windows: flickeringPanes(windowLayout().glass).length,
    taps: tapLeds(tapDevices()).filter((l) => l.blink === true).length,
    lights: lights.filter((l) => l.flicker).length,
  };
  const dark: Record<
    FlashGroup,
    (t: number, reduced: boolean) => number | undefined
  > = {
    signs: (t, r) => dimmedSign(t, 0x5eed, counts.signs, r),
    windows: (t, r) => dimmedWindow(t, counts.windows, r),
    taps: (t, r) => darkLed(t, counts.taps, r),
    lights: (t, r) => cutOutLight(t, counts.lights, r),
  };
  /** The sides each group's flickering members are on. */
  const sidesOf: Record<FlashGroup, Side[]> = {
    signs: ["left"],
    windows: ["right"],
    taps: [
      ...new Set(
        tapDevices()
          .filter((d) => d.leds.some((l) => l.blink === true))
          .map(
            (d) =>
              (d.at.z > 4 ? "front" : d.at.x > 5 ? "right" : "left") as Side,
          ),
      ),
    ],
    lights: [...new Set(lights.filter((l) => l.flicker).map((l) => l.side))],
  };
  const GROUPS: FlashGroup[] = ["signs", "windows", "taps", "lights"];

  /** Flash starts of `groups` together over two minutes, sampled every 10 ms. */
  function flashes(groups: readonly FlashGroup[]): number[] {
    const starts: number[] = [];
    let previous = "";
    for (let t = 0; t < 120_000; t += 10) {
      const now = groups
        .map((g) => {
          const d = dark[g](t, false);
          return d === undefined ? "" : `${g}${String(d)}`;
        })
        .filter((x) => x !== "");
      expect(now.length, `two at once at ${String(t)}`).toBeLessThanOrEqual(1);
      const key = now[0] ?? "";
      if (key !== "" && key !== previous) starts.push(t);
      previous = key;
    }
    return starts;
  }
  function busiestSecond(starts: readonly number[]): number {
    let worst = 0;
    for (let i = 0, j = 0; i < starts.length; i += 1) {
      while ((starts[i] ?? 0) - (starts[j] ?? 0) >= 1000) j += 1;
      worst = Math.max(worst, i - j + 1);
    }
    return worst;
  }

  it("has every group in its share and each dip shorter than a slot", () => {
    const total = GROUPS.reduce((n, g) => n + FLASH_BUDGET.share[g], 0);
    expect(total).toBeLessThanOrEqual(1);
    for (const g of GROUPS) {
      expect(FLASH_BUDGET.dipMs[g]).toBeLessThan(FLICKER.slotMs);
      expect(counts[g], g).toBeGreaterThan(0);
    }
  });

  it("never lets two things flash at once, so the whole scene stays at 3 flashes a second", () => {
    const all = flashes(GROUPS);
    expect(all.length).toBeGreaterThan(200);
    expect(busiestSecond(all)).toBeLessThanOrEqual(maxFlashesPerSecond());
    expect(maxFlashesPerSecond()).toBe(3);
  });

  it("keeps every view to 3 flashes a second: each side and each corner orbit", () => {
    const views: Side[][] = [
      ...SIDES.map((s) => [s]),
      ["front", "right"],
      ["right", "back"],
      ["back", "left"],
      ["left", "front"],
    ];
    for (const view of views) {
      const groups = GROUPS.filter((g) =>
        sidesOf[g].some((s) => view.includes(s)),
      );
      if (groups.length === 0) continue;
      expect(
        busiestSecond(flashes(groups)),
        view.join("+"),
      ).toBeLessThanOrEqual(3);
    }
  }, 30_000);

  it("holds everything steady under reduced motion", () => {
    for (let t = 0; t < 20_000; t += 7)
      for (const g of GROUPS) expect(dark[g](t, true), g).toBeUndefined();
  });
});
