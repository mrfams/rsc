import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { STATUS_META, type StatusKey } from '@/lib/theme';

export function StatusPill({
  status,
  compact,
}: {
  status: string;
  compact?: boolean;
}) {
  const meta = STATUS_META[(status as StatusKey) in STATUS_META ? (status as StatusKey) : 'pending'];
  return (
    <View style={[styles.pill, { backgroundColor: meta.soft }]}>
      <Ionicons name={meta.icon} size={compact ? 12 : 13} color={meta.color} />
      <Text style={[styles.text, { color: meta.color, fontSize: compact ? 11 : 12 }]}>
        {compact ? meta.short : meta.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  text: { fontWeight: '700', letterSpacing: -0.1 },
});

export default StatusPill;
