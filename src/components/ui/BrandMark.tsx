import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { COLORS } from '@/lib/constants';
import { SHADOW } from '@/lib/theme';

/** The RSC logo lives with the other static assets so Metro/SSR both resolve it. */
const RSC_LOGO = require('../../../assets/rsc.jpg');

/**
 * Rounded logo tile used wherever the app shows its mark (splash, rail, drawer,
 * auth header, profile avatar). The source image already has a white
 * background, so it is drawn edge-to-edge inside a soft bordered frame.
 */
export function BrandMark({
  size = 40,
  radius,
  elevated = true,
  style,
}: {
  size?: number;
  radius?: number;
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          borderRadius: radius ?? Math.round(size * 0.32),
        },
        elevated && SHADOW.sm,
        style,
      ]}
    >
      <Image source={RSC_LOGO} style={{ width: size, height: size }} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default BrandMark;
