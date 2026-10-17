import {
  DirectionalLight,
  Group,
  HemisphereLight,
  PointLight,
  type Light,
} from "three";
import { backLampPosition } from "@/logic/ductLayout";
import {
  AMBIENT_LIGHTS,
  LAMP_LOOK,
  NEON_LIGHTS,
  STREET_LAMP_LOOK,
} from "@/logic/lookConfig";
import { PALETTE } from "@/logic/palette";
import { STREET_LAMPS, lampLightPosition } from "@/logic/streetLampLayout";

export type Lights = {
  object: Group;
  dispose(): void;
};

/**
 * Dim sky fill and moon, a coloured point light beside each group of neon, and the dim
 * cold lamp over the back door (task 23), and a warm orange light under each street lamp's
 * head (task 40, steady). No shadows.
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

  const street = STREET_LAMPS.map((spec) => {
    const light = new PointLight(
      STREET_LAMP_LOOK.color,
      STREET_LAMP_LOOK.intensity,
      STREET_LAMP_LOOK.distanceM,
      STREET_LAMP_LOOK.decay,
    );
    light.name = spec.id;
    const at = lampLightPosition(spec);
    light.position.set(at.x, at.y, at.z);
    return light;
  });

  const all: Light[] = [fill, moonLight, ...points, lamp, ...street];
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
