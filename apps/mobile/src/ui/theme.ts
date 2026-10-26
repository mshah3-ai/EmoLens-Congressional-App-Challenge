/**
 * Design tokens (SPEC 28.1). The first block is exactly the spec's table; `accents` and the few extra
 * tokens below it are additions for the log categories (docs/DECISIONS.md). Contrast of every text/icon
 * pair is checked by test/theme.test.ts (WCAG AA, SPEC 28.2).
 */
import { useColorScheme } from 'react-native';

export interface Palette {
  bg: string; surface: string; text: string; textMuted: string; primary: string;
  riskLow: string; riskModerate: string; riskHigh: string; learning: string; border: string;
  // additions
  onPrimary: string;       // text/icons on a primary-colored button
  primarySoft: string;     // tinted background for selected chips, banners
  surfaceAlt: string;      // inputs, pressed rows
  danger: string;          // destructive actions (same hue as riskHigh)
  demo: string;            // demo-mode banner background
  onDemo: string;
  heroFrom: string; heroTo: string; // Today header gradient
}

export type AccentKey = 'episode' | 'meal' | 'med' | 'sleep' | 'place' | 'note' | 'illness' | 'routine' | 'strategy';

export const light: Palette = {
  bg: '#F6F7FB', surface: '#FFFFFF', text: '#1B2233', textMuted: '#5A6378', primary: '#4A5FD6',
  riskLow: '#2E8B6E', riskModerate: '#B7791F', riskHigh: '#C2413B', learning: '#6B7280', border: '#E3E6EF',
  onPrimary: '#FFFFFF', primarySoft: '#E8EBFB', surfaceAlt: '#EEF0F6', danger: '#C2413B',
  demo: '#FFF1D6', onDemo: '#6B4500', heroFrom: '#4A5FD6', heroTo: '#6152CC',
};

export const dark: Palette = {
  bg: '#0F1320', surface: '#181D2E', text: '#E9ECF5', textMuted: '#A3ABC0', primary: '#8C9BFF',
  riskLow: '#4CC39C', riskModerate: '#E5AE52', riskHigh: '#F07A74', learning: '#9CA3AF', border: '#2A3148',
  onPrimary: '#0F1320', primarySoft: '#252C4A', surfaceAlt: '#20263A', danger: '#F07A74',
  demo: '#3A2E12', onDemo: '#FFD98A', heroFrom: '#2B3470', heroTo: '#3F2F73',
};

export const accents: Record<'light' | 'dark', Record<AccentKey, string>> = {
  light: {
    episode: '#4A5FD6', meal: '#B95A16', med: '#0E7C7B', sleep: '#6B4FC2', place: '#2B7A4B',
    note: '#52607A', illness: '#B8336A', routine: '#936000', strategy: '#1D6FA8',
  },
  dark: {
    episode: '#8C9BFF', meal: '#F29B5C', med: '#4FD1C5', sleep: '#B39DFF', place: '#5ED29A',
    note: '#A9B4CC', illness: '#F28AB2', routine: '#F0B44C', strategy: '#6CC1F5',
  },
};

/** 4-pt spacing grid (SPEC 28.1). */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { card: 16, sheet: 24, chip: 999, control: 12 } as const;

/** Type scale: size / line height, system font (SPEC 28.1). */
export const type = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '600' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;
export type TypeVariant = keyof typeof type;

/**
 * The see-through boxes on the Today header (status card, place pill): a dark film, so the white text on them keeps
 * 4.5:1 on every part of the gradient (a white film made it too light, BUGS #33).
 */
export const HERO_GLASS = { color: '#000000', alpha: 0.16 } as const;

/** Minimum touch target (SPEC 28.2). */
export const TOUCH = 44;

/** `#RRGGBB` + alpha 0..1 -> `rgba(...)`, for soft tints behind icons. */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export interface Theme { scheme: 'light' | 'dark'; c: Palette; accent: Record<AccentKey, string>; }

export function useTheme(): Theme {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { scheme, c: scheme === 'dark' ? dark : light, accent: accents[scheme] };
}

/** Soft shadow for cards in light mode only (SPEC 28.1). */
export function cardShadow(scheme: 'light' | 'dark') {
  if (scheme === 'dark') return {};
  return { shadowColor: '#1B2233', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 };
}
