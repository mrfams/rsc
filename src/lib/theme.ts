/**
 * Design tokens shared by every screen. Keep spacing/radius/shadow in one
 * place so the app feels consistent on mobile and desktop.
 */
import { Platform } from 'react-native';

import { COLORS } from '@/lib/constants';

export const RADIUS = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

/** Soft, layered elevation used by cards, sheets and floating controls. */
export const SHADOW = {
  sm: Platform.select({
    web: {
      boxShadow: '0 1px 2px rgba(16,20,19,0.06), 0 1px 3px rgba(16,20,19,0.08)',
    },
    default: {
      shadowColor: '#101413',
      shadowOpacity: 0.08,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
  }),
  md: Platform.select({
    web: {
      boxShadow: '0 8px 24px rgba(16,20,19,0.10), 0 2px 6px rgba(16,20,19,0.05)',
    },
    default: {
      shadowColor: '#101413',
      shadowOpacity: 0.12,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
  }),
  lg: Platform.select({
    web: {
      boxShadow: '0 24px 64px rgba(16,20,19,0.18), 0 4px 12px rgba(16,20,19,0.06)',
    },
    default: {
      shadowColor: '#101413',
      shadowOpacity: 0.2,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 14 },
      elevation: 14,
    },
  }),
};

export const STATUS_META = {
  pending: {
    label: 'Awaiting review',
    short: 'Pending',
    color: COLORS.warning,
    soft: COLORS.warningSoft,
    icon: 'time-outline' as const,
  },
  verified: {
    label: 'Verified',
    short: 'Verified',
    color: COLORS.success,
    soft: COLORS.successSoft,
    icon: 'checkmark-circle-outline' as const,
  },
  disputed: {
    label: 'Reported missing',
    short: 'Disputed',
    color: COLORS.danger,
    soft: COLORS.dangerSoft,
    icon: 'alert-circle-outline' as const,
  },
  removed: {
    label: 'Removed',
    short: 'Removed',
    color: COLORS.textMuted,
    soft: COLORS.surfaceAlt,
    icon: 'trash-outline' as const,
  },
} as const;

export type StatusKey = keyof typeof STATUS_META;

/** Initials for the avatar circle ("Aylin Kaya" → "AK"). */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** "2 min ago" / "Yesterday" / "12 Mar" — compact, readable timestamps. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
