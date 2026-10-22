/**
 * Floating banner that offers an over-the-air update.
 *
 * The native module downloads new bundles in the background on launch; this
 * banner is the "restart now" affordance so nobody has to reinstall the app
 * for a UI change. It renders on every screen (mounted once in the app shell)
 * and disappears as soon as the user dismisses it.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppUpdate } from '@/lib/updates';
import { COLORS } from '@/lib/constants';
import { RADIUS, SHADOW } from '@/lib/theme';

export function UpdateBanner() {
  const { state, apply } = useAppUpdate();
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);

  const visible = state.supported && (state.available || state.pending) && !dismissed;
  if (!visible) return null;

  const pending = state.pending;
  const downloading = state.busy && !pending;
  const percent = Math.round(Math.min(1, Math.max(0, state.progress)) * 100);

  async function onUpdate() {
    setApplying(true);
    try {
      await apply();
    } finally {
      // `apply()` reloads the app, so this only runs when it failed.
      setApplying(false);
    }
  }

  return (
    <View
      style={[styles.wrap, { top: insets.top + 8 }]}
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name="cloud-download-outline" size={19} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {pending ? 'Update ready' : 'New version available'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {downloading
              ? `Downloading… ${percent}%`
              : pending
                ? 'Restart to load the new version.'
                : 'Update without downloading the app again.'}
          </Text>
          {downloading ? (
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(6, percent)}%` }]} />
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={() => void onUpdate()}
          disabled={applying || downloading}
          accessibilityRole="button"
          accessibilityLabel="Install the update now"
          style={({ pressed }) => [styles.action, (applying || downloading) && { opacity: 0.6 }]}
        >
          <Text style={styles.actionText}>{pending ? 'Restart' : 'Update'}</Text>
        </Pressable>
        <Pressable
          onPress={() => setDismissed(true)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Dismiss update"
          style={styles.close}
        >
          <Ionicons name="close" size={16} color={COLORS.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 60,
    elevation: 60,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
    ...SHADOW.lg,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 13.5, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 12, lineHeight: 16, color: COLORS.textMuted, marginTop: 1 },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginTop: 6,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 2 },
  action: {
    paddingHorizontal: 13,
    height: 34,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  close: { padding: 4 },
});

export default UpdateBanner;
