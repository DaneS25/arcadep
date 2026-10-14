import {
  DirectionalLight,
  Group,
  HemisphereLight,
  PointLight,
  type Light,
} from "three";
import { backLampPosition } from "@/logic/ductLayout";
import { AMBIENT_LIGHTS, LAMP_LOOK, NEON_LIGHTS } from "@/logic/lookConfig";
import { PALETTE } from "@/logic/palette";

export type Lights = {
  object: Group;
  dispose(): void;
};

/**
 * Dim sky fill and moon, a coloured point light beside each group of neon, and the dim
 * cold lamp over the back door (task 23). No shadows.
 */
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

  const lamp = new PointLight(
    LAMP_LOOK.color,
    LAMP_LOOK.intensity,
    LAMP_LOOK.distanceM,
    LAMP_LOOK.decay,
  );
  lamp.name = "back-lamp";
  const at = backLampPosition();
  lamp.position.set(at.x, at.y, at.z);

  const all: Light[] = [fill, moonLight, ...points, lamp];
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
