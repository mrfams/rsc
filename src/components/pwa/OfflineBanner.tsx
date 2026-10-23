import { Ionicons } from '@expo/vector-icons';
import * as Network from 'expo-network';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/lib/constants';
import { RADIUS, SHADOW } from '@/lib/theme';

/**
 * Small, non-blocking connectivity notice.
 *
 * The map keeps showing the last cached bins while this is visible, and any
 * bin a member adds is queued and uploaded when the connection returns.
 */
export function OfflineBanner() {
  const state = Network.useNetworkState();
  const offline =
    state.isConnected === false || state.isInternetReachable === false;

  if (!offline) return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.pill}>
        <Ionicons name="cloud-offline-outline" size={14} color={COLORS.warning} />
        <Text style={styles.text}>Offline — showing saved data</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as unknown as 'absolute',
    left: 12,
    right: 12,
    bottom: 158,
    alignItems: 'center',
    zIndex: 70,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.warningSoft,
    borderWidth: 1,
    borderColor: 'rgba(181, 71, 8, 0.22)',
    ...SHADOW.sm,
  },
  text: { fontSize: 11.5, fontWeight: '700', color: COLORS.warning },
});

export default OfflineBanner;
