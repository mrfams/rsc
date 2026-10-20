/**
 * Slide-over drawer used for the app menu and the admin section switcher.
 *
 * Deliberately simple and robust: the panel is always laid out at full height
 * and only its transform changes, so a slow/failed animation can never leave
 * the user staring at a blank screen. Pressing Escape or the scrim closes it.
 */
import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/lib/constants';
import { SHADOW } from '@/lib/theme';

export function Drawer({
  open,
  onClose,
  children,
  side = 'left',
  width = 348,
  label = 'Menu',
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  side?: 'left' | 'right';
  width?: number;
  label?: string;
}) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const panelWidth = Math.min(width, screenWidth * 0.9);
  const direction = side === 'left' ? -1 : 1;
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (open) progress.setValue(0);
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? 240 : 180,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [open, progress]);

  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { height: screenHeight }]}>
        <Animated.View style={[styles.scrim, { opacity: progress }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={`Close ${label}`}
          />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.panel,
            {
              width: panelWidth,
              paddingTop: Math.max(insets.top, 14),
              paddingBottom: Math.max(insets.bottom, 14),
              ...(side === 'left'
                ? { left: 0, borderTopRightRadius: 26, borderBottomRightRadius: 26 }
                : { right: 0, borderTopLeftRadius: 26, borderBottomLeftRadius: 26 }),
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [direction * (panelWidth + 24), 0],
                  }),
                },
              ],
            },
          ]}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(9, 14, 12, 0.45)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    ...SHADOW.lg,
  },
});

export default Drawer;
