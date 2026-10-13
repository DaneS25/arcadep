import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Camera,
} from "three";
import {
  FOG_WISPS,
  advanceWispTime,
  createWisps,
  wispFade,
  wispPose,
} from "@/logic/fogWisps";
import { WISPS_LOOK } from "@/logic/lookConfig";
import { createRng } from "@/logic/rng";

export type FogWisps = {
  readonly object: InstancedMesh;
  /** Drifts the wisps on by `dtMs` (held still under reduced motion) and turns them to the camera. */
  update(dtMs: number, reducedMotion: boolean, camera: Camera): void;
  dispose(): void;
};

/**
 * A soft, lumpy blob of mist on a clear canvas: seeded overlapping puffs inside a circle of
 * half the canvas, so the quad's edges never show. The quad is wider than tall, which
 * stretches it into a streak.
 */
function drawWisp(ctx: CanvasRenderingContext2D, sizePx: number): void {
  const rng = createRng(FOG_WISPS.seed);
  const half = sizePx / 2;
  ctx.clearRect(0, 0, sizePx, sizePx);
  for (let i = 0; i < 14; i += 1) {
    const r = half * rng.range(0.25, 0.45);
    const angle = rng.range(0, Math.PI * 2);
    const d = rng.range(0, half - r);
    const x = half + Math.cos(angle) * d;
    const y = half + Math.sin(angle) * d * 0.6;
    const puff = ctx.createRadialGradient(x, y, 0, x, y, r);
    puff.addColorStop(0, "rgb(255 255 255 / 22%)");
    puff.addColorStop(1, "rgb(255 255 255 / 0%)");
    ctx.fillStyle = puff;
    ctx.fillRect(0, 0, sizePx, sizePx);
  }
}

/**
 * Drifting fog wisps (task 15): every wisp is one instance of a single camera-facing quad,
 * so all of them cost one draw call. Additive and without depth writes, so they need no
 * sorting and only ever lighten the scene; they fade out as the camera comes close.
 */
export function createFogWisps(doc: Document = document): FogWisps {
  const wisps = createWisps();
  const sizePx = WISPS_LOOK.texturePx;
  const canvas = doc.createElement("canvas");
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) drawWisp(ctx, sizePx);
  // Only the alpha is used (white mist, tinted per instance), so no colour space is needed.
  const texture = new CanvasTexture(canvas);

  const geometry = new PlaneGeometry(1, 1);
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const mesh = new InstancedMesh(geometry, material, wisps.length);
  mesh.name = "fog-wisps";
  // The wisps move, so their bounds do too; they ring the building and are nearly always in view.
  mesh.frustumCulled = false;

  const base = new Color(WISPS_LOOK.color).multiplyScalar(WISPS_LOOK.intensity);
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const spin = new Quaternion();
  const facing = new Quaternion();
  const forward = new Vector3(0, 0, 1);
  const cameraPosition = new Vector3();
  const color = new Color();
  let timeS = 0;

  const place = (camera: Camera): void => {
    camera.getWorldPosition(cameraPosition);
    camera.getWorldQuaternion(facing);
    wisps.forEach((wisp, i) => {
      const pose = wispPose(wisp, timeS);
      position.set(pose.position.x, pose.position.y, pose.position.z);
      spin.setFromAxisAngle(forward, pose.tiltRad);
      scale.set(wisp.sizeM, wisp.sizeM * FOG_WISPS.aspect, 1);
      mesh.setMatrixAt(
        i,
        matrix.compose(position, spin.premultiply(facing), scale),
      );
      const fade = wispFade(position.distanceTo(cameraPosition), wisp.sizeM);
      mesh.setColorAt(i, color.copy(base).multiplyScalar(wisp.strength * fade));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
  };

  return {
    object: mesh,
    update(dtMs, reducedMotion, camera) {
      timeS = advanceWispTime(timeS, dtMs, reducedMotion);
      place(camera);
    },
    dispose() {
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}
