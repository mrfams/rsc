import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { COLORS } from '@/lib/constants';
import { SHADOW } from '@/lib/theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  accessibilityLabel: string;
  size?: number;
  iconSize?: number;
  variant?: 'glass' | 'solid' | 'soft' | 'ghost';
  active?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
};

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = 44,
  iconSize = 20,
  variant = 'glass',
  active,
  color,
  style,
  disabled,
}: Props) {
  const background =
    variant === 'solid'
      ? COLORS.primary
      : variant === 'soft'
        ? COLORS.primarySoft
        : variant === 'ghost'
          ? 'transparent'
          : COLORS.glass;
  const iconColor =
    color ?? (variant === 'solid' ? '#FFFFFF' : active ? COLORS.primary : COLORS.text);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: background,
          borderWidth: variant === 'ghost' ? 0 : 1,
          opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={iconSize} color={iconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
});

export default IconButton;
