import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, SOCIAL_LINKS } from '@/lib/constants';
import { RADIUS } from '@/lib/theme';

type Props = {
  compact?: boolean;
  tone?: 'light' | 'dark';
  label?: string;
};

export function SocialLinks({ compact, tone = 'light', label = 'Stay connected' }: Props) {
  const items = [
    {
      key: 'instagram',
      icon: 'logo-instagram' as const,
      title: 'Instagram',
      color: '#E1306C',
      url: SOCIAL_LINKS.instagram,
    },
    {
      key: 'whatsapp',
      icon: 'logo-whatsapp' as const,
      title: 'WhatsApp',
      color: '#1DA851',
      url: SOCIAL_LINKS.whatsapp,
    },
  ];
  const textColor = tone === 'dark' ? 'rgba(255,255,255,0.72)' : COLORS.textMuted;
  const chipBg = tone === 'dark' ? 'rgba(255,255,255,0.12)' : COLORS.surface;
  const chipBorder = tone === 'dark' ? 'rgba(255,255,255,0.18)' : COLORS.border;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      <View style={styles.row}>
        {items.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="link"
            accessibilityLabel={`Open ${item.title}`}
            onPress={() => void Linking.openURL(item.url)}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: chipBg, borderColor: chipBorder },
              compact && styles.chipCompact,
              pressed && { opacity: 0.75 },
            ]}
          >
            <Ionicons name={item.icon} size={compact ? 17 : 18} color={item.color} />
            <Text
              style={[
                styles.chipText,
                { color: tone === 'dark' ? '#FFFFFF' : COLORS.text, fontSize: compact ? 12 : 13 },
              ]}
            >
              {item.title}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  chipCompact: { paddingHorizontal: 11, paddingVertical: 6 },
  chipText: { fontWeight: '600' },
});

export default SocialLinks;
