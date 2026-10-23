import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/lib/constants';
import { RADIUS, SHADOW } from '@/lib/theme';

const DISMISS_KEY = 'rsc.install-prompt-dismissed';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

declare global {
  interface Window {
    __rscInstallPrompt?: InstallPromptEvent;
  }
}

/**
 * Chrome's install prompt, surfaced as a real banner.
 *
 * `beforeinstallprompt` is captured by the small script in +html.tsx as early
 * as possible (Chrome can fire it before React mounts). This component reads
 * that stashed event and offers Install / Not now. Browsers that never fire
 * the event — iOS Safari, Firefox, or a site Chrome does not yet consider
 * installable — simply show nothing.
 */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    // Android Chrome presents its own native install prompt; don't stack a
    // second one on top of it.
    if (/Android/i.test(window.navigator.userAgent)) return;

    let active = true;
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    async function readDismissed() {
      try {
        const value = await AsyncStorage.getItem(DISMISS_KEY);
        return Boolean(value);
      } catch {
        return false;
      }
    }

    function offer() {
      if (!active || !window.__rscInstallPrompt) return;
      setEvent(window.__rscInstallPrompt);
      // Give the page a moment before covering the map with a banner.
      window.setTimeout(() => {
        if (!active) return;
        void readDismissed().then((dismissed) => {
          if (active && !dismissed) setVisible(true);
        });
      }, 4500);
    }

    function onInstalled() {
      setVisible(false);
      window.__rscInstallPrompt = undefined;
    }

    window.addEventListener('rsc-install-ready', offer);
    window.addEventListener('appinstalled', onInstalled);
    offer();

    return () => {
      active = false;
      window.removeEventListener('rsc-install-ready', offer);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!event) return;
    setBusy(true);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'accepted') {
        setVisible(false);
      } else {
        dismiss();
      }
    } catch {
      dismiss();
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    setVisible(false);
    void AsyncStorage.setItem(DISMISS_KEY, '1').catch(() => {});
  }

  if (!visible || !event) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.banner}>
        <View style={styles.icon}>
          <Ionicons name="download-outline" size={19} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>Install EMU Bins</Text>
          <Text style={styles.body} numberOfLines={2}>
            One tap on your home screen — it opens full screen and works offline.
          </Text>
        </View>
        <Pressable
          onPress={() => void install()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Install the EMU Bin Tracker app"
          style={({ pressed }) => [styles.install, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.installText}>{busy ? '…' : 'Install'}</Text>
        </Pressable>
        <Pressable
          onPress={dismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Not now"
          style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="close" size={16} color={COLORS.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as unknown as 'absolute',
    left: 12,
    right: 12,
    bottom: 96,
    alignItems: 'center',
    zIndex: 80,
  },
  banner: {
    width: '100%',
    maxWidth: 460,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 11,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.lg,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  body: { fontSize: 11.5, lineHeight: 16, color: COLORS.textMuted, marginTop: 1 },
  install: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
  },
  installText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  close: { padding: 4 },
});

export default InstallPrompt;
