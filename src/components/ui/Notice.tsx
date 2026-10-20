import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/lib/constants';
import { RADIUS } from '@/lib/theme';

export type NoticeTone = 'error' | 'success' | 'info' | 'warning';

const TONES: Record<NoticeTone, { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> =
  {
    error: { color: COLORS.danger, bg: COLORS.dangerSoft, icon: 'alert-circle-outline' },
    success: { color: COLORS.success, bg: COLORS.successSoft, icon: 'checkmark-circle-outline' },
    info: { color: COLORS.info, bg: COLORS.infoSoft, icon: 'information-circle-outline' },
    warning: { color: COLORS.warning, bg: COLORS.warningSoft, icon: 'warning-outline' },
  };

export function Notice({
  tone = 'info',
  message,
  onDismiss,
  actionLabel,
  onAction,
}: {
  tone?: NoticeTone;
  message: string;
  onDismiss?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const meta = TONES[tone];
  return (
    <View style={[styles.wrap, { backgroundColor: meta.bg }]}>
      <Ionicons name={meta.icon} size={18} color={meta.color} />
      <Text style={[styles.text, { color: meta.color }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          hitSlop={8}
          accessibilityRole="button"
          style={[styles.action, { borderColor: meta.color }]}
        >
          <Text style={[styles.actionText, { color: meta.color }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={8} accessibilityLabel="Dismiss message">
          <Ionicons name="close" size={16} color={meta.color} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
  },
  text: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  action: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  actionText: { fontSize: 11.5, fontWeight: '800' },
});

export default Notice;
