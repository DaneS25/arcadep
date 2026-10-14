import { describe, expect, it } from "vitest";
import { BUILDING, sideNormal, type Side } from "./buildingLayout";
import { roofTopY } from "./detailLayout";
import { steamVents, type SteamVent } from "./ductLayout";
import { LAMP_LOOK, STEAM_LOOK } from "./lookConfig";
import {
  STEAM,
  advanceSteamTime,
  createPuffs,
  lampGlow,
  puffAge,
  puffPose,
} from "./steam";

const VENT: SteamVent = {
  id: "test",
  position: { x: 0, y: 5, z: 7 },
  direction: { x: 0, y: 0, z: 1 },
  strength: 0.8,
  sizeM: 0.3,
};

/** Hue in degrees and saturation of a `#rrggbb` colour. */
function hueSat(hex: string): { hue: number; sat: number } {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return { hue: 0, sat: 0 };
  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  return { hue: (hue * 60 + 360) % 360, sat: d / max };
}

describe("createPuffs", () => {
  it("makes the same puffs on every load, a set per vent", () => {
    const vents = steamVents();
    const a = createPuffs(vents);
    expect(a).toEqual(createPuffs(vents));
    expect(a).toHaveLength(vents.length * STEAM.puffsPerVent);
    expect(createPuffs(vents, 0)).toEqual([]);
  });

  it("spreads each vent's puffs through their lives, so the steam flows steadily", () => {
    const puffs = createPuffs([VENT], 8);
    const ages = puffs.map((p) => puffAge(p, 0)).sort((x, y) => x - y);
    for (let i = 1; i < ages.length; i += 1)
      expect((ages[i] ?? 0) - (ages[i - 1] ?? 0)).toBeLessThan(0.3);
  });
});

describe("puffPose", () => {
  const [puff] = createPuffs([VENT], 1);
  if (puff === undefined) throw new Error("no puff");
  /** The time at which the puff is `share` of the way through its life. */
  const at = (share: number): number => share * puff.lifeS - puff.offsetS;

  it("loops over the puff's life", () => {
    for (const share of [0.1, 0.5, 0.9]) {
      expect(puffAge(puff, at(share))).toBeCloseTo(share, 9);
      expect(puffAge(puff, at(share) + puff.lifeS)).toBeCloseTo(share, 9);
      expect(puffAge(puff, at(share) - 3 * puff.lifeS)).toBeCloseTo(share, 9);
    }
  });

  it("leaves from the vent unseen, then fades out at the end of its life (no popping)", () => {
    const start = puffPose(puff, at(0));
    expect(start.position.x).toBeCloseTo(VENT.position.x, 9);
    expect(start.position.y).toBeCloseTo(VENT.position.y, 9);
    expect(start.position.z).toBeCloseTo(VENT.position.z, 9);
    expect(start.sizeM).toBeCloseTo(VENT.sizeM, 9);
    expect(start.opacity).toBe(0);
    expect(puffPose(puff, at(0.9999)).opacity).toBeLessThan(1e-6);
    for (let s = 0; s < 1; s += 0.05)
      expect(puffPose(puff, at(s)).opacity).toBeLessThanOrEqual(VENT.strength);
    expect(puffPose(puff, at(0.2)).opacity).toBeGreaterThan(0.3);
  });

  it("jets out of the vent, then rises and swells as it goes", () => {
    let last = puffPose(puff, at(0));
    for (let s = 0.1; s < 1; s += 0.1) {
      const pose = puffPose(puff, at(s));
      expect(pose.position.y).toBeGreaterThan(last.position.y);
      expect(pose.sizeM).toBeGreaterThan(last.sizeM);
      last = pose;
    }
    // Most of the push out of the wall is done in the first third of its life.
    const third = puffPose(puff, at(1 / 3)).position.z - VENT.position.z;
    expect(third).toBeGreaterThan(STEAM.jetM * 0.6);
  });

  it("keeps every puff from the building's vents out of its walls", () => {
    const sideOf = (v: SteamVent): Side | undefined =>
      (["front", "right", "back", "left"] as const).find((side) => {
        const n = sideNormal(side);
        return (
          Math.abs(n.x - v.direction.x) + Math.abs(n.z - v.direction.z) < 1e-9
        );
      });
    for (const p of createPuffs(steamVents()))
      for (let s = 0; s < 1; s += 0.05) {
        const { position } = puffPose(p, at(s));
        const inside =
          Math.abs(position.x) < BUILDING.widthM / 2 &&
          Math.abs(position.z) < BUILDING.depthM / 2 &&
          position.y < roofTopY();
        expect(inside, p.vent.id).toBe(false);
        // Wall vents' puffs stay on their own side of the wall.
        const side = sideOf(p.vent);
        if (side === undefined) continue;
        const n = sideNormal(side);
        expect(position.x * n.x + position.z * n.z, p.vent.id).toBeGreaterThan(
          Math.abs(n.x) * (BUILDING.widthM / 2) +
            Math.abs(n.z) * (BUILDING.depthM / 2),
        );
      }
  });
});

describe("advanceSteamTime", () => {
  it("runs in real time and holds still under reduced motion", () => {
    expect(advanceSteamTime(2, 500, false)).toBeCloseTo(2.5, 9);
    expect(advanceSteamTime(2, 500, true)).toBe(2);
    expect(advanceSteamTime(2, -50, false)).toBe(2);
  });
});

describe("lampGlow", () => {
  it("is full at the lamp, falls off with distance and is gone at its range", () => {
    expect(lampGlow(0, LAMP_LOOK.distanceM)).toBe(1);
    let last = 1;
    for (let d = 0.25; d < LAMP_LOOK.distanceM; d += 0.25) {
      const g = lampGlow(d, LAMP_LOOK.distanceM);
      expect(g).toBeLessThan(last);
      expect(g).toBeGreaterThanOrEqual(0);
      last = g;
    }
    expect(lampGlow(LAMP_LOOK.distanceM, LAMP_LOOK.distanceM)).toBe(0);
    expect(lampGlow(20, LAMP_LOOK.distanceM)).toBe(0);
    expect(lampGlow(1, 0)).toBe(0);
  });
});

describe("the steam and lamp colours", () => {
  it("are cold or purple, never yellow, amber or orange", () => {
    for (const hex of [STEAM_LOOK.color, LAMP_LOOK.color, LAMP_LOOK.bulb]) {
      const { hue, sat } = hueSat(hex);
      expect(sat).toBeGreaterThan(0.05);
      expect(hue, hex).toBeGreaterThanOrEqual(200);
      expect(hue, hex).toBeLessThanOrEqual(290);
    }
  });

  it("stay under the bloom threshold away from the lamp, and the lamp stays dim", () => {
    expect(STEAM_LOOK.intensity).toBeLessThanOrEqual(1);
    expect(LAMP_LOOK.intensity).toBeLessThanOrEqual(12);
    expect(LAMP_LOOK.distanceM).toBeLessThanOrEqual(8);
  });
});
