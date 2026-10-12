/**
 * WCAG 2.2 contrast maths for `#rrggbb` colours, so the palette's overlay text and
 * surfaces can be checked in tests (AA: 4.5 for body text, 3 for large text and UI parts).
 */

/** AA minimum for normal-size text. */
export const AA_TEXT = 4.5;
/** AA minimum for large text, focus indicators and other UI parts. */
export const AA_NON_TEXT = 3;

function channel(hex: string, offset: number): number {
  const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance (0 black to 1 white) of a `#rrggbb` colour, or undefined if it isn't one. */
export function relativeLuminance(hex: string): number | undefined {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return undefined;
  return (
    0.2126 * channel(hex, 1) +
    0.7152 * channel(hex, 3) +
    0.0722 * channel(hex, 5)
  );
}

/** Contrast ratio from 1 to 21 between two `#rrggbb` colours, or undefined if either isn't one. */
export function contrastRatio(a: string, b: string): number | undefined {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === undefined || lb === undefined) return undefined;
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}
