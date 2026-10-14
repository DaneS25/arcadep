import { utilityPoles } from "./detailLayout";
import { describe, expect, it } from "vitest";
import {
  sidewalkRect,
  buildingFootprint,
  buildingHeightM,
} from "./buildingLayout";
import {
  FOG_WISPS,
  advanceWispTime,
  createWisps,
  halfHeightM,
  obstacleRadiusM,
  wispFade,
  wispPose,
} from "./fogWisps";

const wisps = createWisps();
/** Times sampled over ten minutes of drift. */
const TIMES = Array.from({ length: 121 }, (_, i) => i * 5);

describe("createWisps", () => {
  it("is the same for the same seed and different for another", () => {
    expect(createWisps()).toEqual(wisps);
    expect(createWisps(FOG_WISPS.count, 7)).not.toEqual(wisps);
  });

  it("makes the asked number of wisps, none for a bad count", () => {
    expect(wisps).toHaveLength(FOG_WISPS.count);
    expect(createWisps(3)).toHaveLength(3);
    expect(createWisps(0)).toEqual([]);
    expect(createWisps(-2)).toEqual([]);
  });

  it("keeps sizes, strengths and drift speeds in their ranges", () => {
    for (const w of wisps) {
      expect(w.sizeM).toBeGreaterThanOrEqual(FOG_WISPS.sizeM[0]);
      expect(w.sizeM).toBeLessThanOrEqual(FOG_WISPS.sizeM[1]);
      expect(w.strength).toBeGreaterThanOrEqual(FOG_WISPS.strength[0]);
      expect(w.strength).toBeLessThanOrEqual(FOG_WISPS.strength[1]);
      const speed = w.angularSpeedRadPerS * w.radiusM;
      expect(speed).toBeGreaterThanOrEqual(FOG_WISPS.speedMps[0]);
      expect(speed).toBeLessThanOrEqual(FOG_WISPS.speedMps[1]);
    }
  });

  it("spreads the wisps all the way round the building", () => {
    const quadrants = new Set(
      wisps.map((w) => {
        const { x, z } = wispPose(w, 0).position;
        return `${String(Math.sign(x))}${String(Math.sign(z))}`;
      }),
    );
    expect(quadrants.size).toBe(4);
  });
});

describe("wispPose", () => {
  it("never brings a wisp's blob into the building, the pavement, the poles or the street", () => {
    const fp = buildingFootprint();
    const walk = sidewalkRect();
    const corners = [
      [fp.minX, fp.minZ],
      [fp.maxX, fp.maxZ],
      [walk.minX, walk.minZ],
      [walk.maxX, walk.minZ],
      [walk.minX, walk.maxZ],
      [walk.maxX, walk.maxZ],
      ...utilityPoles().map((p) => [p.centre.x, p.centre.z]),
    ];
    for (const [x, z] of corners)
      expect(Math.hypot(x ?? 0, z ?? 0)).toBeLessThanOrEqual(obstacleRadiusM());

    for (const w of wisps)
      for (const t of TIMES) {
        const { position } = wispPose(w, t);
        const horizontal = Math.hypot(position.x, position.z);
        expect(horizontal - w.sizeM / 2).toBeGreaterThan(obstacleRadiusM());
        expect(position.y - halfHeightM(w.sizeM)).toBeGreaterThan(0);
        // Mist at street level, under the roofline.
        expect(position.y).toBeLessThan(buildingHeightM());
      }
  });

  it("drifts every wisp the same way round at its own speed", () => {
    for (const w of wisps) {
      const a = wispPose(w, 0).position;
      const b = wispPose(w, 1).position;
      // All turn the same way: the angle grows, so this cross term is negative for each.
      expect(a.x * b.z - a.z * b.x).toBeLessThan(0);
      const moved = Math.hypot(b.x - a.x, b.z - a.z);
      expect(moved).toBeGreaterThan(FOG_WISPS.speedMps[0] * 0.95);
      expect(moved).toBeLessThan(FOG_WISPS.speedMps[1] * 1.05);
    }
  });

  it("bobs and rocks within its range and stays at the same radius", () => {
    for (const w of wisps)
      for (const t of TIMES) {
        const { position, tiltRad } = wispPose(w, t);
        expect(Math.abs(tiltRad)).toBeLessThanOrEqual(FOG_WISPS.tiltRad);
        expect(Math.abs(position.y - w.heightM)).toBeLessThanOrEqual(
          FOG_WISPS.bobM + 1e-9,
        );
        expect(Math.hypot(position.x, position.z)).toBeCloseTo(w.radiusM, 9);
      }
  });
});

describe("halfHeightM", () => {
  it("covers the quad's corners at the steepest rock", () => {
    const size = 10;
    const t = FOG_WISPS.tiltRad;
    const w = size / 2;
    const h = (size * FOG_WISPS.aspect) / 2;
    const corner = w * Math.sin(t) + h * Math.cos(t);
    expect(halfHeightM(size)).toBeCloseTo(corner);
    expect(halfHeightM(size)).toBeLessThan(size / 2);
  });
});

describe("advanceWispTime", () => {
  it("runs on real time", () => {
    expect(advanceWispTime(2, 500, false)).toBeCloseTo(2.5);
  });

  it("stops the drift under reduced motion", () => {
    expect(FOG_WISPS.reducedMotionRate).toBeLessThan(1);
    expect(advanceWispTime(2, 500, true)).toBe(2);
    const w = wisps[0];
    if (w === undefined) throw new Error("no wisps");
    let t = 0;
    for (let i = 0; i < 600; i += 1) t = advanceWispTime(t, 16, true);
    expect(wispPose(w, t)).toEqual(wispPose(w, 0));
  });

  it("never runs backwards", () => {
    expect(advanceWispTime(2, -50, false)).toBe(2);
  });
});

describe("wispFade", () => {
  const hide = 10 * FOG_WISPS.nearHideShare;

  it("hides a wisp while the camera is inside it and shows it fully further off", () => {
    expect(wispFade(0, 10)).toBe(0);
    expect(wispFade(hide, 10)).toBe(0);
    expect(wispFade(hide + FOG_WISPS.nearFadeM, 10)).toBe(1);
    expect(wispFade(100, 10)).toBe(1);
  });

  it("fades in smoothly and only ever grows with distance", () => {
    let last = 0;
    for (let d = 0; d <= 20; d += 0.25) {
      const f = wispFade(d, 10);
      expect(f).toBeGreaterThanOrEqual(last);
      expect(f).toBeLessThanOrEqual(1);
      last = f;
    }
    expect(wispFade(hide + FOG_WISPS.nearFadeM / 2, 10)).toBeCloseTo(0.5);
  });
});
