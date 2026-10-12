import { describe, expect, it } from "vitest";
import { SIDES, interactionSpots } from "./buildingLayout";
import { sideOfId, spotId } from "./interactiveIds";

describe("interactive ids", () => {
  it("builds one id per side and reads the side back", () => {
    for (const side of SIDES) {
      expect(spotId(side)).toBe(`spot-${side}`);
      expect(sideOfId(spotId(side))).toBe(side);
    }
  });

  it("matches the ids the building layout gives its spots", () => {
    for (const spot of interactionSpots()) {
      expect(spotId(spot.side)).toBe(spot.id);
    }
  });
});
