import { Ionicons } from '@expo/vector-icons';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { COLORS } from '@/lib/constants';
import { RADIUS } from '@/lib/theme';

export type SegmentItem<K extends string> = {
  key: K;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  badge?: number;
};

type Props<K extends string> = {
  items: SegmentItem<K>[];
  value: K;
  onChange: (key: K) => void;
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
  tone?: 'neutral' | 'surface';
};

export function Segmented<K extends string>({
  items,
  value,
  onChange,
  scrollable,
  style,
  tone = 'neutral',
}: Props<K>) {
  const content = (
    <View style={styles.row}>
      {items.map((item) => {
        const active = item.key === value;
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.item,
              active && styles.itemActive,
              pressed && !active && styles.itemPressed,
            ]}
          >
            {item.icon ? (
              <Ionicons
                name={item.icon}
                size={16}
                color={active ? COLORS.text : COLORS.textMuted}
              />
            ) : null}
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {item.label}
            </Text>
            {typeof item.badge === 'number' && item.badge > 0 ? (
              <View style={[styles.badge, active && styles.badgeActive]}>
                <Text style={[styles.badgeText, active && styles.badgeTextActive]}>
                  {item.badge > 99 ? '99+' : item.badge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={[styles.container, tone === 'neutral' ? styles.track : styles.trackSurface, style]}>
      {scrollable ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: RADIUS.sm, padding: 4, alignSelf: 'flex-start', maxWidth: '100%' },
  track: { backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border },
  trackSurface: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  scroll: { flexGrow: 1 },
  row: { flexDirection: 'row', gap: 3, flexGrow: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: RADIUS.xs,
  },
  itemActive: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  itemPressed: { backgroundColor: COLORS.surface },
  label: { fontSize: 13.5, fontWeight: '600', color: COLORS.textMuted },
  labelActive: { color: COLORS.text, fontWeight: '700' },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
  },
  badgeActive: { backgroundColor: COLORS.primary },
  badgeText: { fontSize: 10.5, fontWeight: '700', color: COLORS.primary },
  badgeTextActive: { color: '#FFFFFF' },
});

export default Segmented;
