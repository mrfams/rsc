/**
 * App-wide feedback: lightweight toasts for routine confirmations and a
 * blocking dialog for moments that deserve a beat (bin added, geofence saved,
 * report verified…). One provider at the root; call `useFeedback()` anywhere.
 */
import { Ionicons } from '@expo/vector-icons';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { COLORS } from '@/lib/constants';
import { RADIUS, SHADOW } from '@/lib/theme';

export type Tone = 'success' | 'error' | 'info' | 'warning';

type ToastPayload = {
  id: number;
  title: string;
  message?: string;
  tone: Tone;
};

type DialogPayload = {
  title: string;
  message?: string;
  tone: Tone;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void;
};

type FeedbackApi = {
  toast: (input: Omit<ToastPayload, 'id'>) => void;
  showDialog: (input: DialogPayload) => void;
  hideDialog: () => void;
  confirm: (input: DialogPayload) => void;
};

const FeedbackContext = createContext<FeedbackApi | null>(null);

const TONE_META: Record<Tone, { color: string; soft: string; icon: keyof typeof Ionicons.glyphMap }> = {
  success: { color: COLORS.success, soft: COLORS.successSoft, icon: 'checkmark-circle' },
  error: { color: COLORS.danger, soft: COLORS.dangerSoft, icon: 'alert-circle' },
  info: { color: COLORS.info, soft: COLORS.infoSoft, icon: 'information-circle' },
  warning: { color: COLORS.warning, soft: COLORS.warningSoft, icon: 'warning' },
};

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastPayload[]>([]);
  const [dialog, setDialog] = useState<DialogPayload | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((input: Omit<ToastPayload, 'id'>) => {
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-2), { ...input, id }]);
    if (Platform.OS !== 'web') {
      // Native toasts are tappable; auto-dismiss still applies below.
    }
    setTimeout(() => dismiss(id), input.tone === 'error' ? 6500 : 4200);
  }, [dismiss]);

  const api = useMemo<FeedbackApi>(
    () => ({
      toast,
      showDialog: (input) => setDialog({ ...input, cancelLabel: undefined, destructive: false }),
      confirm: (input) => setDialog(input),
      hideDialog: () => setDialog(null),
    }),
    [toast],
  );

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      <FeedbackDialog dialog={dialog} onClose={() => setDialog(null)} />
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside <FeedbackProvider>');
  return ctx;
}

/* --------------------------------- toasts --------------------------------- */

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastPayload[];
  onDismiss: (id: number) => void;
}) {
  const insets = useSafeAreaInsets();
  if (toasts.length === 0) return null;
  return (
    <View
      style={[styles.toastStack, { bottom: Math.max(insets.bottom, 16) + 78 }]}
      pointerEvents="box-none"
    >
      {toasts.map((item) => (
        <Toast key={item.id} item={item} onDismiss={() => onDismiss(item.id)} />
      ))}
    </View>
  );
}

function Toast({ item, onDismiss }: { item: ToastPayload; onDismiss: () => void }) {
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      friction: 9,
      tension: 90,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [anim]);

  const meta = TONE_META[item.tone];

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }),
            },
          ],
        },
      ]}
      accessibilityRole="alert"
    >
      <View style={[styles.toastIcon, { backgroundColor: meta.soft }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.toastTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.message ? (
          <Text style={styles.toastMessage} numberOfLines={3}>
            {item.message}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={onDismiss}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
        style={styles.toastClose}
      >
        <Ionicons name="close" size={15} color={COLORS.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

/* --------------------------------- dialog --------------------------------- */

function FeedbackDialog({ dialog, onClose }: { dialog: DialogPayload | null; onClose: () => void }) {
  return (
    <Modal visible={Boolean(dialog)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.dialogRoot}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close dialog"
        />
        {dialog ? (
          <View style={styles.dialogCard} accessibilityViewIsModal>
            <View style={[styles.dialogIcon, { backgroundColor: TONE_META[dialog.tone].soft }]}>
              <Ionicons
                name={TONE_META[dialog.tone].icon}
                size={30}
                color={TONE_META[dialog.tone].color}
              />
            </View>
            <Text style={styles.dialogTitle}>{dialog.title}</Text>
            {dialog.message ? <Text style={styles.dialogMessage}>{dialog.message}</Text> : null}
            <View style={styles.dialogActions}>
              {dialog.onConfirm ? (
                <>
                  <Button
                    title={dialog.cancelLabel ?? 'Cancel'}
                    variant="secondary"
                    size="md"
                    onPress={onClose}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title={dialog.confirmLabel ?? 'Continue'}
                    variant={dialog.destructive ? 'danger' : 'primary'}
                    size="md"
                    onPress={() => {
                      dialog.onConfirm?.();
                      onClose();
                    }}
                    style={{ flex: 1 }}
                  />
                </>
              ) : (
                <Button
                  title={dialog.confirmLabel ?? 'Done'}
                  size="md"
                  onPress={onClose}
                  style={{ width: '100%' }}
                />
              )}
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  toastStack: {
    position: Platform.OS === 'web' ? ('fixed' as unknown as 'absolute') : 'absolute',
    left: 16,
    right: 16,
    gap: 8,
    zIndex: 90,
    alignItems: 'center',
  },
  toast: {
    width: '100%',
    maxWidth: 460,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.lg,
  },
  toastIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastTitle: { fontSize: 13.5, fontWeight: '700', color: COLORS.text },
  toastMessage: { fontSize: 12.5, lineHeight: 18, color: COLORS.textMuted, marginTop: 2 },
  toastClose: { padding: 6 },

  dialogRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    backgroundColor: COLORS.overlay,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 26,
    alignItems: 'center',
    gap: 10,
    ...SHADOW.lg,
  },
  dialogIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  dialogTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  dialogMessage: {
    fontSize: 13.5,
    lineHeight: 20,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 6,
  },
  dialogActions: { flexDirection: 'row', gap: 9, width: '100%', marginTop: 4 },
});
