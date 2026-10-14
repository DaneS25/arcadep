import type { Material, Mesh, Texture } from "three";
import type { TextureSet } from "@/logic/assetFallback";
import type { TextureSlot } from "@/logic/assetManifest";
import { sidewalkRect } from "@/logic/buildingLayout";
import { EDGE_FADE, streetBox } from "@/logic/sidewalkLayout";
import { createSurface } from "./surface";

export type Ground = {
  object: Mesh;
  applyTextures(
    textures: Readonly<Record<TextureSlot, TextureSet<Texture>>>,
  ): void;
  dispose(): void;
};

const glsl = (n: number): string => n.toFixed(4);

/**
 * Fades the street out past the kerb (task 24), as `streetFade` does: full brightness by
 * the kerb, black `EDGE_FADE.endM` out, before the fog is mixed in. Its light, reflections
 * and puddle sheen all go, so nothing past the pavement shows; exposure and fill light are
 * untouched.
 */
function addEdgeFade(material: Material): void {
  const r = sidewalkRect();
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vEdgeWorld;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvEdgeWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vEdgeWorld;",
      )
      .replace(
        "#include <fog_fragment>",
        [
          `vec2 edgeOut = max( max( vec2( ${glsl(r.minX)}, ${glsl(r.minZ)} ) - vEdgeWorld.xz, vec2( 0.0 ) ), vEdgeWorld.xz - vec2( ${glsl(r.maxX)}, ${glsl(r.maxZ)} ) );`,
          `gl_FragColor.rgb *= 1.0 - smoothstep( ${glsl(EDGE_FADE.startM)}, ${glsl(EDGE_FADE.endM)}, length( edgeOut ) );`,
          "#include <fog_fragment>",
        ].join("\n"),
      );
  };
  material.customProgramCacheKey = () => "street-edge-fade";
}

/**
 * The wet street: a thin slab whose top is at y = 0, with world-sized texture tiles. It
 * only reaches a little past the pavement (task 24), fading to black on the way.
 */
export function createGround(): Ground {
  const surface = createSurface("street", [streetBox()], "ground");
  const material = surface.object.material;
  for (const m of Array.isArray(material) ? material : [material])
    addEdgeFade(m);
  return {
    object: surface.object,
    applyTextures(textures) {
      surface.applyTextures(textures);
    },
    dispose() {
      surface.dispose();
    },
  };
}
