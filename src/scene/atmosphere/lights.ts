import {
  DirectionalLight,
  Group,
  HemisphereLight,
  PointLight,
  type Light,
} from "three";
import { AMBIENT_LIGHTS, NEON_LIGHTS } from "@/logic/lookConfig";
import { PALETTE } from "@/logic/palette";

export type Lights = {
  object: Group;
  dispose(): void;
};

/** Dim sky fill and moon, plus a coloured point light beside each group of neon. No shadows. */
export function createLights(): Lights {
  const { hemisphere, moon } = AMBIENT_LIGHTS;
  const fill = new HemisphereLight(
    hemisphere.sky,
    hemisphere.ground,
    hemisphere.intensity,
  );
  const moonLight = new DirectionalLight(moon.color, moon.intensity);
  moonLight.position.set(moon.position.x, moon.position.y, moon.position.z);

  const points = NEON_LIGHTS.map((spec) => {
    const light = new PointLight(
      PALETTE[spec.color],
      spec.intensity,
      spec.distanceM,
    );
    light.name = spec.name;
    light.position.set(spec.position.x, spec.position.y, spec.position.z);
    return light;
  });

  const all: Light[] = [fill, moonLight, ...points];
  const group = new Group();
  group.name = "lights";
  group.add(...all);

  return {
    object: group,
    dispose() {
      group.clear();
      for (const light of all) light.dispose();
    },
  };
}
