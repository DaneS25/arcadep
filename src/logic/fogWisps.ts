/**
 * Drifting fog wisps (task 15): soft blobs of mist that drift round the building on wide
 * circles, bobbing a little and turning slowly. Pure and seeded, so every load drifts the
 * same way and the maths is tested; `scene/atmosphere/fogWisps.ts` draws them as one
 * instanced mesh of camera-facing quads.
 */

import { sidewalkRect, type Rect, type Vec3 } from "./buildingLayout";
import { createRng } from "./rng";

export const FOG_WISPS = {
  count: 20,
  seed: 0x0f06_2a3d,
  /** Width of a wisp's quad; the blob stays inside it. */
  sizeM: [8, 15],
  /** Height of a wisp's quad over its width: long, low streaks of mist. */
  aspect: 0.45,
  /** Clear room between a wisp's edge and the pavement's corners. */
  clearanceM: 1.5,
  /** Extra orbit radius past the clearance, so wisps spread out in depth. */
  spreadM: 8,
  /** Height above the lowest a wisp can sit without its blob cutting into the street. */
  liftM: [0, 3],
  /** Speed along the orbit; all wisps drift the same way, like a light wind. */
  speedMps: [0.3, 0.7],
  bobM: 0.4,
  /** One bob takes this long. */
  bobPeriodS: [14, 26],
  /** Each streak rocks slowly in the view by up to this, so it never stands up on end... */
  tiltRad: 0.12,
  /** ...at this rate (one rock takes a minute or more). */
  tiltRateRadPerS: [0.02, 0.08],
  /** How bright each wisp is, relative to the brightest. */
  strength: [0.55, 1],
  /** Drift rate under reduced motion: 0 stops it (the wisps stay where they are). */
  reducedMotionRate: 0,
  /** A wisp is hidden while the camera is within this share of its width of its centre... */
  nearHideShare: 0.3,
  /** ...and fades in over this distance beyond that. */
  nearFadeM: 5,
} as const;

export type Wisp = {
  readonly sizeM: number;
  /** Distance from the building's vertical axis. */
  readonly radiusM: number;
  readonly heightM: number;
  readonly angle0Rad: number;
  /** Positive for every wisp, so they all drift the same way round. */
  readonly angularSpeedRadPerS: number;
  readonly bobRadPerS: number;
  readonly bobPhaseRad: number;
  readonly tiltPhaseRad: number;
  readonly tiltRateRadPerS: number;
  /** 0 to 1, times the look's intensity. */
  readonly strength: number;
};

export type WispPose = {
  readonly position: Vec3;
  /** Turn of the quad about the view direction, within `FOG_WISPS.tiltRad`. */
  readonly tiltRad: number;
};

/**
 * The farthest any pavement corner is from the building's vertical axis. The pavement
 * (task 24) holds the building, the kerb and the utility poles, so wisps drifting outside
 * it never cut into any of them; it reaches about as far as the old alley wall (gone in task 24) did.
 */
export function obstacleRadiusM(): number {
  const r: Rect = sidewalkRect();
  let radius = 0;
  for (const x of [r.minX, r.maxX])
    for (const z of [r.minZ, r.maxZ])
      radius = Math.max(radius, Math.hypot(x, z));
  return radius;
}

/** How far a wisp's quad reaches above or below its centre, rocked as far as it goes. */
export function halfHeightM(sizeM: number): number {
  const t = FOG_WISPS.tiltRad;
  return (
    (sizeM / 2) * Math.sin(t) + ((sizeM * FOG_WISPS.aspect) / 2) * Math.cos(t)
  );
}

/** `count` wisps from `seed`, each on its own circle clear of the building. */
export function createWisps(
  count: number = FOG_WISPS.count,
  seed: number = FOG_WISPS.seed,
): Wisp[] {
  const w = FOG_WISPS;
  const rng = createRng(seed);
  const clear = obstacleRadiusM() + w.clearanceM;
  const wisps: Wisp[] = [];
  for (let i = 0; i < Math.max(0, Math.floor(count)); i += 1) {
    const sizeM = rng.range(w.sizeM[0], w.sizeM[1]);
    const radiusM = clear + sizeM / 2 + rng.range(0, w.spreadM);
    const speed = rng.range(w.speedMps[0], w.speedMps[1]);
    wisps.push({
      sizeM,
      radiusM,
      // Low enough to read as street fog, high enough that the blob never dips into the street.
      heightM: halfHeightM(sizeM) + w.bobM + rng.range(w.liftM[0], w.liftM[1]),
      // Spread evenly round the building, with some jitter.
      angle0Rad: ((i + rng.range(-0.4, 0.4)) / count) * Math.PI * 2,
      angularSpeedRadPerS: speed / radiusM,
      bobRadPerS: (Math.PI * 2) / rng.range(w.bobPeriodS[0], w.bobPeriodS[1]),
      bobPhaseRad: rng.range(0, Math.PI * 2),
      tiltPhaseRad: rng.range(0, Math.PI * 2),
      tiltRateRadPerS: rng.range(w.tiltRateRadPerS[0], w.tiltRateRadPerS[1]),
      strength: rng.range(w.strength[0], w.strength[1]),
    });
  }
  return wisps;
}

/** Where a wisp is `timeS` seconds into the drift. */
export function wispPose(wisp: Wisp, timeS: number): WispPose {
  const angle = wisp.angle0Rad + wisp.angularSpeedRadPerS * timeS;
  return {
    position: {
      x: Math.sin(angle) * wisp.radiusM,
      y:
        wisp.heightM +
        FOG_WISPS.bobM * Math.sin(wisp.bobPhaseRad + wisp.bobRadPerS * timeS),
      z: Math.cos(angle) * wisp.radiusM,
    },
    tiltRad:
      FOG_WISPS.tiltRad *
      Math.sin(wisp.tiltPhaseRad + wisp.tiltRateRadPerS * timeS),
  };
}

/**
 * The drift clock moved on by a frame: real time normally, `reducedMotionRate` of it under
 * reduced motion (0, so the wisps hold still). Seconds as a double stay precise for years.
 */
export function advanceWispTime(
  timeS: number,
  dtMs: number,
  reducedMotion: boolean,
): number {
  const rate = reducedMotion ? FOG_WISPS.reducedMotionRate : 1;
  return timeS + (Math.max(0, dtMs) / 1000) * rate;
}

/**
 * How much of a wisp shows (0 to 1) with the camera `distanceM` from its centre: none
 * while the camera is in its thick, fading in over `nearFadeM`, so a wisp never fills the
 * view or cuts through the near plane.
 */
export function wispFade(distanceM: number, sizeM: number): number {
  const t = (distanceM - sizeM * FOG_WISPS.nearHideShare) / FOG_WISPS.nearFadeM;
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}
