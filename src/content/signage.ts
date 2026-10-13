/**
 * Shop signs on the building (task 14). The rooftop neon sign shows `profile.name`, so it
 * changes with the profile. Short words read best; long ones are shrunk to fit their sign.
 */
export type Signage = {
  /** Over the storefront on the front, beside the arcade cabinet. */
  readonly cafe: string;
  /** On the first floor of the right side, seen from the street corner. */
  readonly arcade: string;
};

// DUMMY: replace
export const signage: Signage = {
  cafe: "COFFEE",
  arcade: "ARCADE",
};
