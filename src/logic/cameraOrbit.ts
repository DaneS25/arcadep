/**
 * Camera orbit around the building: limits, the view of each side, turning between sides
 * and the tween between two views. Pure maths, applied to the three.js camera by
 * `app/cameraRig.ts`.
 *
 * Angles follow three.js `Spherical` (and so `OrbitControls`): the azimuth turns around +y
 * from +z towards +x, the same convention as `sideAzimuthRad`, and the polar angle is
 * measured down from straight up (+y).
 */

import { SIDES, sideAzimuthRad, type Side, type Vec3 } from "./buildingLayout";

export type Orbit = {
  readonly azimuthRad: number;
  /** 0 looks straight down; π/2 is level with the target. */
  readonly polarRad: number;
  readonly distanceM: number;
};

const DEG = Math.PI / 180;

export const CAMERA = {
  /** The point the camera orbits and looks at: the building's centre line, first floor. */
  target: { x: 0, y: 6, z: 0 },
  /**
   * Lowest the camera can tilt: it stays 5° above the target's height, so even at the
   * closest zoom it sits over 7 m up, above the street and the 5 m alley wall.
   */
  maxPolarRad: 85 * DEG,
  /** Highest the camera can tilt, short of looking straight down. */
  minPolarRad: 20 * DEG,
  /**
   * Closest the camera can get: past the building's farthest corner from the target
   * (the top of the parapet, about 11 m away), so it never ends up inside the walls or
   * the roof.
   */
  minDistanceM: 14,
  maxDistanceM: 45,
  /**
   * How each side is framed when the arrow keys snap to it: high enough that the back
   * view sees the alley side of the building over the 5 m alley wall.
   */
  sidePolarRad: 58 * DEG,
  sideDistanceM: 28,
  /** Opening view: a three-quarter view of the street corner, between the front and the right. */
  start: { azimuthRad: 30 * DEG, polarRad: 65 * DEG, distanceM: 32 },
  /** Length of a snap between two sides. */
  tweenMs: 900,
} as const;

const TAU = 2 * Math.PI;

/** An angle wrapped into [0, 2π). */
export function wrapAngleRad(angleRad: number): number {
  const wrapped = angleRad % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}

/** The signed shortest turn from one angle to another, in (-π, π]. */
export function shortestTurnRad(fromRad: number, toRad: number): number {
  const turn = wrapAngleRad(toRad - fromRad);
  return turn > Math.PI ? turn - TAU : turn;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The orbit pulled back inside the pitch and zoom limits, with its azimuth wrapped. */
export function clampOrbit(orbit: Orbit): Orbit {
  return {
    azimuthRad: wrapAngleRad(orbit.azimuthRad),
    polarRad: clamp(orbit.polarRad, CAMERA.minPolarRad, CAMERA.maxPolarRad),
    distanceM: clamp(orbit.distanceM, CAMERA.minDistanceM, CAMERA.maxDistanceM),
  };
}

/** Where the camera sits for an orbit around `target`. */
export function orbitPosition(
  orbit: Orbit,
  target: Vec3 = CAMERA.target,
): Vec3 {
  const ground = orbit.distanceM * Math.sin(orbit.polarRad);
  return {
    x: target.x + ground * Math.sin(orbit.azimuthRad),
    y: target.y + orbit.distanceM * Math.cos(orbit.polarRad),
    z: target.z + ground * Math.cos(orbit.azimuthRad),
  };
}

/** The view that frames a side, straight on. */
export function sideView(side: Side): Orbit {
  return {
    azimuthRad: sideAzimuthRad(side),
    polarRad: CAMERA.sidePolarRad,
    distanceM: CAMERA.sideDistanceM,
  };
}

/** The side whose view is closest to an azimuth. */
export function nearestSide(azimuthRad: number): Side {
  let best: Side = "front";
  let bestTurn = Number.POSITIVE_INFINITY;
  for (const side of SIDES) {
    const turn = Math.abs(shortestTurnRad(azimuthRad, sideAzimuthRad(side)));
    if (turn < bestTurn) {
      best = side;
      bestTurn = turn;
    }
  }
  return best;
}

/** Which way to walk round the building, as seen by a visitor facing it. */
export type TurnDirection = "left" | "right";

/**
 * The next side round the building. Walking right from the front reaches the right side,
 * then the back, then the left; walking left goes the other way (the `SIDES` order).
 */
export function turnSide(side: Side, direction: TurnDirection): Side {
  const index = SIDES.indexOf(side);
  const step = direction === "left" ? 1 : SIDES.length - 1;
  return SIDES[(index + step) % SIDES.length] ?? side;
}

export type CameraTween = {
  readonly from: Orbit;
  readonly to: Orbit;
  /** Zero means a cut: the first sample is already the end. */
  readonly durationMs: number;
};

/** A move between two views; a cut when the visitor asked for reduced motion. */
export function planTween(
  from: Orbit,
  to: Orbit,
  reducedMotion: boolean,
): CameraTween {
  return {
    from,
    to,
    durationMs: reducedMotion ? 0 : CAMERA.tweenMs,
  };
}

/** Smooth start and stop, for t in [0, 1]. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export type TweenSample = { readonly orbit: Orbit; readonly done: boolean };

/**
 * The view `elapsedMs` into a tween. The azimuth takes the shorter way round, so a snap
 * between neighbouring sides is always a quarter turn.
 */
export function sampleTween(
  tween: CameraTween,
  elapsedMs: number,
): TweenSample {
  const raw = tween.durationMs > 0 ? elapsedMs / tween.durationMs : 1;
  const t = clamp(Number.isFinite(raw) ? raw : 1, 0, 1);
  if (t >= 1) return { orbit: clampOrbit(tween.to), done: true };
  const e = easeInOutCubic(t);
  const { from, to } = tween;
  return {
    orbit: {
      azimuthRad: wrapAngleRad(
        from.azimuthRad + shortestTurnRad(from.azimuthRad, to.azimuthRad) * e,
      ),
      polarRad: from.polarRad + (to.polarRad - from.polarRad) * e,
      distanceM: from.distanceM + (to.distanceM - from.distanceM) * e,
    },
    done: false,
  };
}
