/**
 * Steam wafting out of the vents (task 23): each vent lets out a stream of puffs that
 * leave along its direction, slow down, rise, swell and fade, drifting a little on the
 * wind. Pure and seeded, so every load looks the same and the maths is tested; the fog
 * wisps' instanced mesh (`scene/atmosphere/fogWisps.ts`) draws the puffs as more of its
 * instances, so steam costs no draw call. The back door lamp lights the puffs near it
 * (`lampGlow`).
 */

import type { Vec3 } from "./buildingLayout";
import { createRng } from "./rng";
import type { SteamVent } from "./ductLayout";

export const STEAM = {
  seed: 0x57ea_3d23,
  puffsPerVent: 7,
  /** How long one puff lives, from the vent to gone. */
  lifeS: [4.5, 6.5],
  /** How far a puff carries along the vent's direction before it stops pushing. */
  jetM: 0.6,
  /** How quickly the push dies away (per share of a puff's life). */
  jetFalloff: 4,
  /** Rise of warm steam, speeding up a little as it goes. */
  riseMps: 0.28,
  riseAccelMps2: 0.03,
  /** A light breeze, the same for every puff. */
  windMps: { x: 0.1, z: 0.04 },
  /** Side-to-side waver. */
  wobbleM: 0.12,
  wobbleRadPerS: [0.6, 1.2],
  /** A puff swells to this many times its size at the vent. */
  growth: 5,
  /** Share of a puff's life it takes to fade in. */
  fadeInShare: 0.12,
  /** Slow turn of each puff in the view. */
  spinRadPerS: [-0.25, 0.25],
  /** Drift rate under reduced motion: 0 stops it (the puffs stay where they are). */
  reducedMotionRate: 0,
} as const;

export type Puff = {
  readonly vent: SteamVent;
  readonly lifeS: number;
  /** Where in its life the puff is at time 0, in seconds. */
  readonly offsetS: number;
  readonly wobblePhaseRad: number;
  readonly wobbleRadPerS: number;
  readonly spinPhaseRad: number;
  readonly spinRadPerS: number;
};

export type PuffPose = {
  readonly position: Vec3;
  readonly sizeM: number;
  /** 0 to 1, times the vent's strength: none as it leaves the vent and none at its end. */
  readonly opacity: number;
  readonly spinRad: number;
};

/** `STEAM.puffsPerVent` puffs for each vent, spread evenly through their lives. */
export function createPuffs(
  vents: readonly SteamVent[],
  perVent: number = STEAM.puffsPerVent,
  seed: number = STEAM.seed,
): Puff[] {
  const s = STEAM;
  const rng = createRng(seed);
  const count = Math.max(0, Math.floor(perVent));
  const puffs: Puff[] = [];
  for (const vent of vents)
    for (let i = 0; i < count; i += 1) {
      const lifeS = rng.range(s.lifeS[0], s.lifeS[1]);
      puffs.push({
        vent,
        lifeS,
        offsetS: ((i + rng.range(-0.3, 0.3)) / count) * lifeS,
        wobblePhaseRad: rng.range(0, Math.PI * 2),
        wobbleRadPerS: rng.range(s.wobbleRadPerS[0], s.wobbleRadPerS[1]),
        spinPhaseRad: rng.range(0, Math.PI * 2),
        spinRadPerS: rng.range(s.spinRadPerS[0], s.spinRadPerS[1]),
      });
    }
  return puffs;
}

/** How far through its life (0 to 1) a puff is at `timeS`. */
export function puffAge(puff: Puff, timeS: number): number {
  const t = (timeS + puff.offsetS) % puff.lifeS;
  return (t < 0 ? t + puff.lifeS : t) / puff.lifeS;
}

const smooth = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/** Where a puff is, how big and how thick, `timeS` seconds into the steam. */
export function puffPose(puff: Puff, timeS: number): PuffPose {
  const s = STEAM;
  const t = puffAge(puff, timeS);
  const ageS = t * puff.lifeS;
  const { position: p, direction: d } = puff.vent;
  const jet =
    (s.jetM * (1 - Math.exp(-s.jetFalloff * t))) /
    (1 - Math.exp(-s.jetFalloff));
  const rise = s.riseMps * ageS + s.riseAccelMps2 * ageS * ageS;
  // The waver grows as the puff slows, so the steam leaves the vent in a clean jet.
  const wobble =
    s.wobbleM * t * Math.sin(puff.wobblePhaseRad + puff.wobbleRadPerS * ageS);
  return {
    position: {
      x: p.x + d.x * jet + s.windMps.x * ageS + wobble,
      y: p.y + d.y * jet + rise,
      z: p.z + d.z * jet + s.windMps.z * ageS - wobble * 0.5,
    },
    sizeM: puff.vent.sizeM * (1 + s.growth * Math.sqrt(t)),
    opacity: puff.vent.strength * smooth(t / s.fadeInShare) * (1 - t) * (1 - t),
    spinRad: puff.spinPhaseRad + puff.spinRadPerS * ageS,
  };
}

/**
 * The steam clock moved on by a frame: real time normally, `reducedMotionRate` of it under
 * reduced motion (0, so the puffs hold still where they are).
 */
export function advanceSteamTime(
  timeS: number,
  dtMs: number,
  reducedMotion: boolean,
): number {
  const rate = reducedMotion ? STEAM.reducedMotionRate : 1;
  return timeS + (Math.max(0, dtMs) / 1000) * rate;
}

/**
 * How much the back door lamp lights a puff `distanceM` from it, 0 to 1: full at the
 * lamp, falling off with distance like the lamp's own light and gone at `rangeM`.
 */
export function lampGlow(distanceM: number, rangeM: number): number {
  if (rangeM <= 0) return 0;
  const d = Math.max(0, distanceM);
  const edge = Math.max(0, 1 - (d / rangeM) ** 4);
  return (edge * edge) / (1 + d * d);
}
