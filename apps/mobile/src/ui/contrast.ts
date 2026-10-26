/** WCAG 2.1 contrast ratio between two `#RRGGBB` colors (used by the theme test). */
function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** Color of `fg` with `alpha` painted over `bg` (to check icons on tinted circles). */
export function over(fg: string, alpha: number, bg: string): string {
  const f = parseInt(fg.slice(1), 16), b = parseInt(bg.slice(1), 16);
  const mix = (sh: number) => Math.round(((f >> sh) & 255) * alpha + ((b >> sh) & 255) * (1 - alpha));
  return `#${[16, 8, 0].map((sh) => mix(sh).toString(16).padStart(2, '0')).join('')}`;
}
