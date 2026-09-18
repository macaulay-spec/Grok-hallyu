/**
 * Hallyu Design System
 * Cinematic • Premium • Apple-level restraint
 * Accent: Electric Magenta
 */

export const colors = {
  // Base
  background: '#0A0A0A',
  surface: '#141414',
  surfaceElevated: '#1F1F1F',
  surfaceHover: '#262626',

  // Text
  textPrimary: '#FAFAFA',
  textSecondary: '#A1A1AA',
  textTertiary: '#71717A',
  textInverse: '#0A0A0A',

  // Accent
  accent: '#E11D48',
  accentSoft: '#9F1239',
  accentMuted: '#4C0519',
  accentGlow: 'rgba(225, 29, 72, 0.25)',

  // Borders & Dividers
  border: '#27272A',
  borderSubtle: '#1F1F1F',
  divider: '#18181B',

  // Semantic
  error: '#EF4444',
  errorSoft: 'rgba(239, 68, 68, 0.15)',
  success: '#22C55E',
  successSoft: 'rgba(34, 197, 94, 0.15)',
  warning: '#F59E0B',

  // Overlays
  overlay: 'rgba(0, 0, 0, 0.6)',
  overlayHeavy: 'rgba(0, 0, 0, 0.8)',
  glass: 'rgba(20, 20, 20, 0.85)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 64,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const;

export const typography = {
  // Display
  display: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
  },
  // Headlines
  h1: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700' as const,
    letterSpacing: -0.4,
  },
  h2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600' as const,
    letterSpacing: -0.3,
  },
  h3: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600' as const,
  },
  // Body
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as const,
  },
  bodyMedium: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500' as const,
  },
  // Small
  callout: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400' as const,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as const,
  },
  captionSmall: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400' as const,
  },
  // Button
  button: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600' as const,
  },
  buttonSmall: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
} as const;

export const shadows = {
  soft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  glow: {
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
} as const;

export type ColorKey = keyof typeof colors;
export type SpacingKey = keyof typeof spacing;
