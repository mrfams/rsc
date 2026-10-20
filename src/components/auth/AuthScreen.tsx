import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { SocialLinks } from '@/components/ui/SocialLinks';
import { authClient, useSession } from '@/lib/auth-client';
import { COLORS } from '@/lib/constants';
import { RADIUS, SHADOW } from '@/lib/theme';
import { useHydrated } from '@/lib/use-hydrated';

type Mode = 'signin' | 'signup';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthScreen({ initialMode = 'signin' }: { initialMode?: Mode }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const hydrated = useHydrated();
  const desktop = hydrated && Platform.OS === 'web' && width >= 1024;
  const { data: session, isPending } = useSession();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function finish() {
    // Always land on the map. Relying on history here used to strand people
    // on the auth screen after a successful sign-in.
    router.replace('/');
  }

  useEffect(() => {
    if (!isPending && session?.user) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, session]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  async function submit() {
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (mode === 'signup' && confirm !== password) {
      setError('The passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await authClient.signIn.email({
          email: cleanEmail,
          password,
        });
        if (err) {
          setError(friendlyError(err.message));
          return;
        }
      } else {
        const { error: err } = await authClient.signUp.email({
          name: name.trim() || cleanEmail.split('@')[0],
          email: cleanEmail,
          password,
        });
        if (err) {
          setError(friendlyError(err.message));
          return;
        }
      }
      finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <View style={[styles.formCard, desktop && styles.formCardDesktop]}>
      <View style={styles.mobileBrand}>
        <View style={styles.brandMark}>
          <Ionicons name="leaf" size={20} color="#FFFFFF" />
        </View>
        <View>
          <Text style={styles.brandName}>EMU Bin Tracker</Text>
          <Text style={styles.brandSub}>Find a bin. Add a bin. Keep campus clean.</Text>
        </View>
      </View>

      <View style={styles.headingRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {mode === 'signin' ? 'Welcome back' : 'Join the map'}
          </Text>
          <Text style={styles.subtitle}>
            {mode === 'signin'
              ? 'Sign in to report bins, verify sightings and track impact.'
              : 'Anyone can join — no campus email required.'}
          </Text>
        </View>
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="close" size={19} color={COLORS.text} />
        </Pressable>
      </View>

      <Segmented
        items={[
          { key: 'signin' as const, label: 'Sign in', icon: 'log-in-outline' },
          { key: 'signup' as const, label: 'Create account', icon: 'person-add-outline' },
        ]}
        value={mode}
        onChange={switchMode}
        style={{ marginTop: 22 }}
      />

      <View style={styles.fields}>
        {mode === 'signup' ? (
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="How should we call you?"
            icon="person-outline"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
          />
        ) : null}
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          icon="mail-outline"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          returnKeyType="next"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
          icon="lock-closed-outline"
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          textContentType={mode === 'signin' ? 'password' : 'newPassword'}
          onSubmitEditing={() => (mode === 'signin' ? void submit() : undefined)}
        />
        {mode === 'signup' ? (
          <Field
            label="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Type it once more"
            icon="shield-checkmark-outline"
            secureTextEntry
            autoCapitalize="none"
            textContentType="newPassword"
            onSubmitEditing={() => void submit()}
          />
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={17} color={COLORS.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Button
          title={mode === 'signin' ? 'Sign in' : 'Create account'}
          onPress={() => void submit()}
          loading={busy}
          size="lg"
          iconRight="arrow-forward"
          style={{ marginTop: 4 }}
        />

        <Text style={styles.terms}>
          By continuing you agree to keep sightings truthful and respectful. Reports are public on
          the campus map.
        </Text>
      </View>

      <View style={styles.social}>
        <SocialLinks compact label="Questions? Reach the team" />
      </View>
    </View>
  );

  if (desktop) {
    return (
      <View style={styles.desktopRoot}>
        <View style={styles.hero}>
          <View style={[styles.blob, { width: 420, height: 420, top: -120, right: -140 }]} />
          <View style={[styles.blob, { width: 260, height: 260, bottom: -80, left: -80 }]} />
          <View style={styles.heroTop}>
            <View style={styles.heroBrandMark}>
              <Ionicons name="leaf" size={22} color={COLORS.primary} />
            </View>
            <Text style={styles.heroBrand}>EMU Bin Tracker</Text>
          </View>

          <View style={styles.heroBody}>
            <Text style={styles.heroEyebrow}>SUSTAINABILITY, MAPPED</Text>
            <Text style={styles.heroTitle}>Every bin on campus.{'\n'}One living map.</Text>
            <Text style={styles.heroCopy}>
              Report a bin in seconds, confirm what others find, and help the whole campus waste
              less. Built for phones and desktops alike.
            </Text>

            <View style={styles.features}>
              <Feature icon="location-outline" title="Pin it where it is" text="Tap the map, no coordinates needed." />
              <Feature icon="people-outline" title="Verified by the community" text="Two independent sightings make a bin trusted." />
              <Feature icon="cloud-offline-outline" title="Works offline" text="Report now, sync automatically when you reconnect." />
            </View>
          </View>

          <View style={styles.heroFooter}>
            <SocialLinks tone="dark" label="Follow the work" />
          </View>
        </View>

        <View style={styles.formSide}>
          <ScrollView
            contentContainerStyle={styles.formScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {form}
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.mobileRoot}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.mobileScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {form}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.feature}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={19} color={COLORS.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureText}>{text}</Text>
      </View>
    </View>
  );
}

function friendlyError(message?: string): string {
  if (!message) return 'Something went wrong. Try again.';
  const lower = message.toLowerCase();
  if (lower.includes('invalid email or password')) return 'That email and password do not match.';
  if (lower.includes('already exists') || lower.includes('user already')) {
    return 'An account with this email already exists. Try signing in.';
  }
  if (lower.includes('password')) return message;
  return message;
}

const styles = StyleSheet.create({
  desktopRoot: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.surface },
  hero: {
    flex: 1,
    backgroundColor: COLORS.primary,
    padding: 52,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  blob: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 11, zIndex: 1 },
  heroBrandMark: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBrand: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.2 },
  heroBody: { maxWidth: 520, gap: 18, zIndex: 1 },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.65)',
  },
  heroTitle: {
    fontSize: 48,
    lineHeight: 54,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1.8,
  },
  heroCopy: { fontSize: 16, lineHeight: 25, color: 'rgba(255,255,255,0.8)', maxWidth: 470 },
  features: { gap: 14, marginTop: 12 },
  feature: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: { fontSize: 14.5, fontWeight: '800', color: '#FFFFFF' },
  featureText: { fontSize: 13, color: 'rgba(255,255,255,0.72)', marginTop: 2 },
  heroFooter: { zIndex: 1 },

  formSide: { width: 540, backgroundColor: COLORS.surface, justifyContent: 'center' },
  formScroll: { flexGrow: 1, justifyContent: 'center', padding: 48 },
  formCard: { width: '100%', gap: 2 },
  formCardDesktop: { maxWidth: 420, alignSelf: 'center' },
  mobileBrand: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 30 },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.sm,
  },
  brandName: { fontSize: 16, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  brandSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 31, fontWeight: '800', color: COLORS.text, letterSpacing: -1 },
  subtitle: { fontSize: 14, lineHeight: 20, color: COLORS.textMuted, marginTop: 7, maxWidth: 360 },
  close: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fields: { gap: 14, marginTop: 20 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.dangerSoft,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: { flex: 1, fontSize: 13, color: COLORS.danger, fontWeight: '600' },
  terms: {
    fontSize: 11.5,
    lineHeight: 17,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  social: { marginTop: 30 },

  mobileRoot: { flex: 1, backgroundColor: COLORS.surface },
  mobileScroll: { flexGrow: 1, padding: 22, justifyContent: 'center' },
});
