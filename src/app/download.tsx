/**
 * "Get the app" — the public download surface.
 *
 * There is no Play Store or App Store listing yet, so Android users install
 * the APK that EAS builds and iPhone users use the web app. The link is read
 * from the server (the admin can point it at a newer build without shipping
 * an app update) and rendered as a QR code so it can be shared on posters and
 * in class.
 */
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/ui/BrandMark';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { useFeedback } from '@/components/ui/Feedback';
import { api } from '@/lib/api-client';
import { ANDROID_DOWNLOAD_URL, APP_WEB_URL, COLORS } from '@/lib/constants';
import { siteMetadata } from '@/lib/site-metadata';
import { RADIUS, SHADOW } from '@/lib/theme';
import { useAppUpdate } from '@/lib/updates';

export function generateMetadata() {
  return siteMetadata({
    title: 'Get the app',
    path: '/download',
    description:
      'Install the free EMU Bin Tracker Android app, or open the web app on iPhone. No app store needed.',
  });
}

export default function DownloadScreen() {
  const { toast } = useFeedback();
  const { state, check } = useAppUpdate();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'info' | 'success' | 'error'>('info');
  const [showQr, setShowQr] = useState(false);

  const { data } = useQuery({
    queryKey: ['download'],
    queryFn: () => api<{ androidUrl: string }>('/api/download'),
    retry: false,
    staleTime: 60_000,
  });

  const androidUrl = data?.androidUrl ?? ANDROID_DOWNLOAD_URL;
  const version = Constants.expoConfig?.version ?? '1.0.0';

  async function openUrl(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      toast({
        tone: 'error',
        title: 'Could not open the link',
        message: 'Copy the link and paste it into your browser instead.',
      });
    }
  }

  async function onCheck() {
    setChecking(true);
    const result = await check();
    setChecking(false);
    setMessage(result.message);
    setTone(
      result.status === 'available'
        ? 'info'
        : result.status === 'current'
          ? 'success'
          : result.status === 'error'
            ? 'error'
            : 'info',
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </Pressable>
        <BrandMark size={34} radius={11} />
        <Text style={styles.headerTitle}>Get the app</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Carry the campus map with you</Text>
          <Text style={styles.heroSub}>
            Report a bin, confirm what you see and get the leaderboard — wherever you are on
            campus.
          </Text>
        </View>

        {/* ------------------------------ Android ----------------------------- */}
        <Card style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.cardIcon, { backgroundColor: COLORS.primarySoft }]}>
              <Ionicons name="logo-android" size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Android</Text>
              <Text style={styles.cardMeta}>
                Version {version}
                {state.channel ? ` · ${state.channel} channel` : ''}
              </Text>
            </View>
          </View>

          <Text style={styles.body}>
            We are not on the Play Store yet, so the app comes as a normal APK install file. Tap the
            button below to download it, then open the file to install it on Android.
          </Text>

          <Button
            title="Download the app"
            icon="download-outline"
            onPress={() => void openUrl(androidUrl)}
          />

          <Text style={styles.footnote}>
            Android will ask you once to allow installs from this source. After that the app
            updates itself — no new download needed.
          </Text>

          <Pressable
            onPress={() => setShowQr((open) => !open)}
            accessibilityRole="button"
            style={styles.qrToggle}
          >
            <Ionicons
              name={showQr ? 'chevron-down' : 'qr-code-outline'}
              size={16}
              color={COLORS.primary}
            />
            <Text style={styles.qrToggleText}>
              {showQr ? 'Hide the QR code' : 'Show a QR code for posters'}
            </Text>
          </Pressable>

          {showQr ? (
            <View style={styles.qrRow}>
              <View style={styles.qrBox}>
                <QRCode
                  value={androidUrl}
                  size={168}
                  color={COLORS.text}
                  backgroundColor="#FFFFFF"
                  quietZone={4}
                />
              </View>
              <View style={styles.qrSide}>
                <Text style={styles.qrHint}>Point a camera at the code to get the same file.</Text>
                <Text style={styles.qrHintMuted} numberOfLines={3}>
                  {androidUrl}
                </Text>
              </View>
            </View>
          ) : null}
        </Card>

        {/* -------------------------------- iPhone ----------------------------- */}
        <Card style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.cardIcon, { backgroundColor: COLORS.infoSoft }]}>
              <Ionicons name="logo-apple" size={20} color={COLORS.info} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>iPhone & iPad</Text>
              <Text style={styles.cardMeta}>Add to Home Screen</Text>
            </View>
          </View>

          <Text style={styles.body}>
            The iOS build is not signed for the App Store yet, so iPhone users get the same map in
            the browser. Open it, tap Share, then “Add to Home Screen” — it launches full screen
            with its own icon.
          </Text>

          <Button
            title="Open the web app"
            icon="globe-outline"
            variant="secondary"
            onPress={() => void openUrl(APP_WEB_URL)}
          />
        </Card>

        {/* ------------------------------ Updates ----------------------------- */}
        <Card style={styles.card}>
          {message ? <Notice tone={tone} message={message} onDismiss={() => setMessage(null)} /> : null}

          <Button
            title="Check for updates"
            icon="refresh-outline"
            variant="secondary"
            loading={checking}
            onPress={() => void onCheck()}
          />
          {state.runtimeVersion ? (
            <Text style={styles.footnote}>
              Runtime {state.runtimeVersion}
              {state.channel ? ` · channel ${state.channel}` : ''}
            </Text>
          ) : null}
        </Card>

        <Pressable
          onPress={() => router.replace('/')}
          style={({ pressed }) => [styles.backToMap, pressed && { opacity: 0.7 }]}
          accessibilityRole="link"
        >
          <Ionicons name="map-outline" size={17} color={COLORS.primary} />
          <Text style={styles.backToMapText}>Back to the campus map</Text>
        </Pressable>

        {Platform.OS === 'web' ? (
          <Text style={styles.footnote}>
            You are using the web version — it updates itself whenever we deploy.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  back: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  scroll: { padding: 16, gap: 14, paddingBottom: 40 },
  hero: { gap: 4, paddingHorizontal: 2 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, letterSpacing: -0.6 },
  heroSub: { fontSize: 13.5, lineHeight: 19, color: COLORS.textMuted },
  card: { gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  cardIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15.5, fontWeight: '800', color: COLORS.text },
  cardMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  body: { fontSize: 13.5, lineHeight: 20, color: COLORS.textMuted },
  qrToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  qrToggleText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  qrRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  qrBox: {
    padding: 10,
    borderRadius: RADIUS.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  qrSide: { flex: 1, gap: 6 },
  qrHint: { fontSize: 12.5, lineHeight: 18, color: COLORS.text, fontWeight: '600' },
  qrHintMuted: { fontSize: 11.5, lineHeight: 15, color: COLORS.textMuted },
  footnote: { fontSize: 11.5, lineHeight: 16, color: COLORS.textMuted },
  backToMap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
  },
  backToMapText: { fontSize: 13.5, fontWeight: '700', color: COLORS.primary },
});
