export const clamp = (v: number, a: number, b: number): number =>
  v < a ? a : v > b ? b : v;

export const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');

/** Lighten (f>0) or darken (f<0) a #rrggbb hex color; returns an rgb() string. */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  r = clamp(Math.round(r * (1 + f)), 0, 255);
  g = clamp(Math.round(g * (1 + f)), 0, 255);
  b = clamp(Math.round(b * (1 + f)), 0, 255);
  return `rgb(${r},${g},${b})`;
}

/** Number config value with a fallback, coerced to int. */
export const cfgInt = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;

export const cfgNum = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

export const cfgBool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback;

export const cfgStr = (v: unknown, fallback: string): string =>
  typeof v === 'string' ? v : fallback;
