/**
 * brand.ts — logo SMAILWOLF (v3.0).
 *
 * The original 4K file (4096x1024) is kept in public/brand/ as the source asset.
 * The app only uses the 800px downscale (enough for ~320px display,
 * ~100KB instead of ~900KB).
 *
 * ETHAN'S RULE — map by BACKGROUND BRIGHTNESS, NOT by file name:
 * - DARK background (dark mode / navy loading screen) → LIGHT file (WHITE swoosh)
 * - LIGHT background (light mode) → DARK file (DARK swoosh)
 * File names are easy to mix up (DARK file = dark swoosh, LIGHT file = white swoosh)
 * so this function is the only place allowed to pick the file.
 */
export type AppTheme = 'light' | 'dark';

export const BRAND_DARK_800 = '/brand/SMAILWOLF_DARK_800.png';
export const BRAND_LIGHT_800 = '/brand/SMAILWOLF_LIGHT_800.png';

/** Logo for a light/dark background, per the current theme. */
export function brandLogoSrc(theme: AppTheme): string {
  return theme === 'dark' ? BRAND_LIGHT_800 : BRAND_DARK_800;
}

/** Logo for the fixed dark navy background (loading screen) — always the white swoosh. */
export const BRAND_ON_DARK = BRAND_LIGHT_800;
