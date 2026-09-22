import { Platform, TextStyle } from 'react-native';

/**
 * Hallyu design tokens (dark only, near-black canvas, one accent).
 * Source of truth: docs/design/04-design-language.md + tokens/hallyu.tokens.json
 */

export const palette = {
  ink1000: '#000000',
  ink950: '#0A0A0A',
  ink900: '#111113',
  ink850: '#161618',
  ink800: '#1C1C1F',
  ink700: '#26262B',
  ink600: '#34343A',
  ink500: '#4B4B53',
  ink450: '#61616B',
  ink400: '#7A7A85',
  ink300: '#A1A1AA',
  ink200: '#C4C4CC',
  ink100: '#D6D6DC',
  white: '#FAFAFA',
  rose700: '#BE123C',
  rose600: '#E11D48',
  rose500: '#F43F5E',
  rose400: '#FB7185',
  rose300: '#FDA4AF',
  amber500: '#E8A33D',
  amber400: '#F2B84B',
  green400: '#34D399',
  yellow400: '#FBBF24',
  red400: '#F87171',
  blue400: '#60A5FA',
} as const;

export const colors = {
  canvas: palette.ink950,
  surface1: palette.ink900,
  surface2: palette.ink850,
  surface3: palette.ink800,
  borderSubtle: palette.ink800,
  borderStrong: palette.ink450,
  textPrimary: palette.white,
  textSecondary: palette.ink300,
  textTertiary: palette.ink400,
  textDisabled: palette.ink500,
  onAccent: palette.white,
  onMedia: palette.white,
  accent: palette.rose600,
  accentText: palette.rose400,
  accentPressed: palette.rose700,
  accentSoft: 'rgba(225,29,72,0.14)',
  warm: palette.amber400,
  warmSoft: 'rgba(242,184,75,0.14)',
  live: palette.rose600,
  success: palette.green400,
  warning: palette.yellow400,
  danger: palette.red400,
  dangerFill: palette.rose700,
  info: palette.blue400,
  veil: palette.ink850,
  overlay: 'rgba(0,0,0,0.56)',
  scrim: 'rgba(0,0,0,0.72)',
  skeleton: palette.ink800,
  skeletonHighlight: palette.ink700,
  reaction: {
    loved: palette.rose500,
    cried: palette.blue400,
    screamed: palette.yellow400,
    swooned: palette.rose300,
    laughed: palette.amber400,
    furious: palette.red400,
  },
} as const;

/** Font families are one-per-weight (React Native on Android cannot pick weights from a single family). */
export const fonts = {
  regular: 'Pretendard-Regular',
  medium: 'Pretendard-Medium',
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
  extrabold: 'Pretendard-ExtraBold',
} as const;

const t = (fontSize: number, lineHeight: number, family: string, extra?: TextStyle): TextStyle => ({
  fontSize,
  lineHeight,
  fontFamily: family,
  color: colors.textPrimary,
  ...extra,
});

export const type = {
  displayLarge: t(40, 44, fonts.extrabold, { letterSpacing: -0.8 }),
  display: t(32, 38, fonts.extrabold, { letterSpacing: -0.5 }),
  headline: t(26, 32, fonts.bold, { letterSpacing: -0.3 }),
  titleLarge: t(22, 28, fonts.bold, { letterSpacing: -0.2 }),
  title: t(18, 24, fonts.semibold),
  titleSmall: t(16, 22, fonts.semibold),
  bodyLarge: t(17, 26, fonts.regular),
  body: t(15, 22, fonts.regular),
  bodySmall: t(14, 20, fonts.regular),
  label: t(13, 18, fonts.semibold),
  caption: t(12, 16, fonts.medium, { color: colors.textSecondary }),
  overline: t(11, 14, fonts.bold, { letterSpacing: 0.66, textTransform: 'uppercase', color: colors.textSecondary }),
  button: t(15, 20, fonts.semibold),
  tabLabel: t(11, 14, fonts.semibold),
} as const;

export type TypeVariant = keyof typeof type;

export const space = {
  x1: 4,
  x2: 8,
  x3: 12,
  x4: 16,
  x5: 20,
  x6: 24,
  x8: 32,
  x10: 40,
  x12: 48,
  x16: 64,
  margin: 16,
  gutter: 12,
  section: 32,
} as const;

export const radius = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, full: 999 } as const;

export const sizes = {
  touch: 48,
  topBar: 56,
  tabBar: 64,
  /** left navigation rail on medium/expanded widths */
  rail: 80,
  createButton: 40,
  avatar: { xs: 24, sm: 32, md: 40, lg: 56, xl: 88 },
  poster: { s: 72, m: 104, l: 140, xl: 180 },
  readingColumn: 640,
  heroMax: 420,
} as const;

export const aspect = { poster: 2 / 3, backdrop: 16 / 9, short: 9 / 16, avatar: 1, postImage: 4 / 5 } as const;

export const motion = {
  instant: 80,
  short: 160,
  medium: 260,
  long: 400,
  slow: 600,
  livePulse: 1600,
  skeletonDelay: 150,
} as const;

export const hairline = Platform.select({ ios: 0.5, default: 1 }) as number;

/** Window size classes (Material adaptive) */
export const breakpoints = { medium: 600, expanded: 840 } as const;
export type WindowClass = 'compact' | 'medium' | 'expanded';
export function windowClass(width: number): WindowClass {
  if (width >= breakpoints.expanded) return 'expanded';
  if (width >= breakpoints.medium) return 'medium';
  return 'compact';
}
export function marginFor(width: number) {
  const wc = windowClass(width);
  return wc === 'compact' ? 16 : wc === 'medium' ? 24 : 32;
}
