/**
 * Shared visual constants with light/dark mode support.
 * Use getThemeColors(colorScheme) to get colors for the current appearance.
 */

export const LIGHT = {
  bg: '#F6F7F8',
  surface: '#FFFFFF',
  text: '#16191C',
  textMuted: '#6B7280',
  border: '#E4E7EA',
  primary: '#0E7490', // teal-700 — recycling blue-green
  primarySoft: '#E0F2F7',
  danger: '#DC2626',
  success: '#15803D',
}

export const DARK = {
  bg: '#0F172A',
  surface: '#1E293B',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  border: '#334155',
  primary: '#67E8F9', // sky-400 for contrast in dark
  primarySoft: '#0891B2', // sky-500
  danger: '#F87171',
  success: '#34D399',
}

export const COLORS = {
  bg: '#F6F7F8',
  surface: '#FFFFFF',
  text: '#16191C',
  textMuted: '#6B7280',
  border: '#E4E7EA',
  primary: '#0E7490',
  primarySoft: '#E0F2F7',
  danger: '#DC2626',
  success: '#15803D',
};

export const getThemeColors = (colorScheme: 'light' | 'dark') =>
  colorScheme === 'dark' ? DARK : LIGHT

export const CATEGORY_COLORS: Record<string, string> = {
  plastic: '#0284C7',
  paper: '#7C3AED',
  glass: '#059669',
  metal: '#EA580C',
  battery: '#DC2626',
  general: '#52525B',
}

export const CATEGORIES = [
  'plastic',
  'paper',
  'glass',
  'metal',
  'battery',
  'general',
] as const

/** EMU, Famagusta — default map centre. */
export const CAMPUS_CENTER = { latitude: 35.3786, longitude: 33.9422 }

/**
 * Reportable area — a rough polygon around the EMU main campus (incl. dorm
 * side). Coordinates are hand-tuned; refine edges against a real campus map
 * whenever needed. Server-side validation uses this exact polygon.
 */
export const CAMPUS_POLYGON: { latitude: number; longitude: number }[] = [
  { latitude: 35.382, longitude: 33.934 },
  { latitude: 35.3826, longitude: 33.9444 },
  { latitude: 35.379, longitude: 33.9466 },
  { latitude: 35.3746, longitude: 33.9484 },
  { latitude: 35.3708, longitude: 33.9456 },
  { latitude: 35.369, longitude: 33.9376 },
  { latitude: 35.3734, longitude: 33.9322 },
]