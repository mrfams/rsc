import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { COLORS } from '@/lib/constants';
import { RADIUS } from '@/lib/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
type Size = 'sm' | 'md' | 'lg';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

const HEIGHT: Record<Size, number> = { sm: 40, md: 48, lg: 54 };
const FONT: Record<Size, number> = { sm: 14, md: 15, lg: 16 };

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading,
  disabled,
  fullWidth,
  style,
}: Props) {
  const inactive = disabled || loading;
  const palette = PALETTES[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        {
          height: HEIGHT[size],
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: palette.border ? 1 : 0,
          opacity: inactive ? 0.5 : pressed ? 0.86 : 1,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.text} />
      ) : (
        <View style={styles.content}>
          {icon ? <Ionicons name={icon} size={FONT[size] + 3} color={palette.text} /> : null}
          <Text style={[styles.label, { color: palette.text, fontSize: FONT[size] }]}>
            {title}
          </Text>
          {iconRight ? (
            <Ionicons name={iconRight} size={FONT[size] + 2} color={palette.text} />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const PALETTES: Record<Variant, { bg: string; text: string; border?: string }> = {
  primary: { bg: COLORS.primary, text: '#FFFFFF' },
  secondary: { bg: COLORS.surface, text: COLORS.text, border: COLORS.border },
  ghost: { bg: 'transparent', text: COLORS.primary },
  danger: { bg: COLORS.dangerSoft, text: COLORS.danger, border: COLORS.danger },
  dark: { bg: COLORS.text, text: '#FFFFFF' },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: RADIUS.sm,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { width: '100%' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontWeight: '700', letterSpacing: -0.2 },
});

export default Button;
