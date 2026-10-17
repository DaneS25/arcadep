import { Color, type Material, type Mesh, type Texture } from "three";
import type { TextureSet } from "@/logic/assetFallback";
import type { TextureSlot } from "@/logic/assetManifest";
import { sidewalkRect } from "@/logic/buildingLayout";
import {
  AURORA,
  EDGE_WAVES,
  FOLD_WAVES,
  GAP_WAVES,
  SKY,
  advanceAuroraTime,
  skyDomeData,
} from "@/logic/nightSky";
import { GROUND, groundBox } from "@/logic/sidewalkLayout";
import { createSurface } from "./surface";

export type Ground = {
  object: Mesh;
  applyTextures(
    textures: Readonly<Record<TextureSlot, TextureSet<Texture>>>,
  ): void;
  /** Moves the aurora on by `dtMs` (it holds still under reduced motion). */
  update(dtMs: number, reducedMotion: boolean): void;
  dispose(): void;
};

const glsl = (n: number): string => n.toFixed(4);

/** A sum of waves in GLSL, as `wavesAt` in `logic/nightSky.ts` adds them up. */
const wavesGlsl = (waves: typeof EDGE_WAVES): string =>
  waves
    .map(
      (w) =>
        `${glsl(w.weight)} * sin( ${glsl(w.cycles)} * a + ${glsl(w.turns)} * w * t + ${glsl(w.phase)} )`,
    )
    .join(" + ");

/** The sky's colour in a direction, mirroring `skyColor` (task 38). */
const SKY_GLSL = `
uniform float uAuroraTimeS;
uniform vec3 uAuroraLow;
uniform vec3 uAuroraHigh;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
varying float vSky;
varying vec3 vSkyDir;
vec3 nightSky( vec3 dir ) {
  float e = asin( clamp( dir.y, -1.0, 1.0 ) );
  float a = atan( dir.z, dir.x );
  float t = uAuroraTimeS;
  float w = ${glsl((2 * Math.PI) / AURORA.periodS)};
  float lo = ${glsl(AURORA.baseRad)} + ${glsl(AURORA.waveRad)} * ( ${wavesGlsl(EDGE_WAVES)} );
  float rise = lo + ${glsl(AURORA.riseRad)};
  float top = lo + ${glsl(AURORA.heightRad)};
  float curtain = smoothstep( lo, rise, e ) * ( 1.0 - smoothstep( rise, top, e ) );
  float fold = 0.5 + 0.5 * ( ${wavesGlsl(FOLD_WAVES)} );
  fold *= fold;
  float spread = smoothstep( ${glsl(AURORA.gapFrom)}, ${glsl(AURORA.gapTo)}, ${wavesGlsl(GAP_WAVES)} );
  float strength = ${glsl(AURORA.intensity)} * curtain * spread * ( ${glsl(AURORA.foldFloor)} + ${glsl(1 - AURORA.foldFloor)} * fold );
  vec3 aurora = mix( uAuroraLow, uAuroraHigh * ${glsl(AURORA.highGain)}, smoothstep( rise, top, e ) ) * strength;
  vec3 lit = mix( uSkyHorizon, uSkyZenith, smoothstep( 0.0, ${glsl(SKY.gradientRad)}, e ) ) + aurora;
  return mix( lit, uSkyHorizon, 1.0 - smoothstep( 0.0, ${glsl(SKY.hazeRad)}, e ) );
}
`;

/**
 * Two things in one shader, so the sky costs no draw call:
 * - the ground fades into the dark past the kerb, as `groundFade` does (lit up to
 *   `GROUND.fadeStartM`, black by `GROUND.fadeEndM`), before the fog is mixed in; past the
 *   fade it skips the lighting (only the fog colour is left there);
 * - the sky dome's vertices (`skyMask` 1) skip the lighting and draw the night sky and
 *   aurora (`skyColor`) instead, with the fog's colour hazing the horizon.
 */
function addGroundAndSky(
  material: Material,
  uniforms: Record<string, { value: unknown }>,
): void {
  const r = sidewalkRect();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float skyMask;\nvarying float vSky;\nvarying vec3 vSkyDir;\nvarying vec3 vEdgeWorld;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvSky = skyMask;\nvSkyDir = position;\nvEdgeWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vEdgeWorld;\n${SKY_GLSL}`,
      )
      // The fog line first: the early exits below include the fog chunk too.
      .replace(
        "#include <fog_fragment>",
        "gl_FragColor.rgb *= groundFade;\n#include <fog_fragment>",
      )
      .replace(
        "#include <clipping_planes_fragment>",
        [
          "#include <clipping_planes_fragment>",
          "if ( vSky > 0.5 ) {",
          "  gl_FragColor = vec4( nightSky( normalize( vSkyDir ) ), 1.0 );",
          "  return;",
          "}",
          `vec2 edgeOut = max( max( vec2( ${glsl(r.minX)}, ${glsl(r.minZ)} ) - vEdgeWorld.xz, vec2( 0.0 ) ), vEdgeWorld.xz - vec2( ${glsl(r.maxX)}, ${glsl(r.maxZ)} ) );`,
          `float groundFade = 1.0 - smoothstep( ${glsl(GROUND.fadeStartM)}, ${glsl(GROUND.fadeEndM)}, length( edgeOut ) );`,
          // Past the fade the ground is black under the fog, so skip its lighting there.
          "if ( groundFade <= 0.0 ) {",
          "  gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );",
          "  #include <fog_fragment>",
          "  return;",
          "}",
        ].join("\n"),
      );
  };
  material.customProgramCacheKey = () => "ground-and-sky";
}

/**
 * The plain concrete ground (task 38): a thin slab, top at y = 0, running on well past the
 * pavement and fading into the dark, plus the night sky dome round everything, in one mesh.
 */
export function createGround(): Ground {
  const surface = createSurface(
    "ground",
    [groundBox()],
    "ground",
    undefined,
    undefined,
    { data: skyDomeData(), flag: "skyMask" },
  );
  const time = { value: 0 };
  const uniforms = {
    uAuroraTimeS: time,
    uAuroraLow: { value: new Color(AURORA.low) },
    uAuroraHigh: { value: new Color(AURORA.high) },
    uSkyZenith: { value: new Color(SKY.zenith) },
    uSkyHorizon: { value: new Color(SKY.horizon) },
  };
  const material = surface.object.material;
  for (const m of Array.isArray(material) ? material : [material])
    addGroundAndSky(m, uniforms);
  return {
    object: surface.object,
    applyTextures(textures) {
      surface.applyTextures(textures);
    },
    update(dtMs, reducedMotion) {
      time.value = advanceAuroraTime(time.value, dtMs, reducedMotion);
    },
    dispose() {
      surface.dispose();
    },
  };
}
