import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authClient } from '@/lib/auth-client';
import { COLORS } from '@/lib/constants';
import { Field } from '@/components/ui/Field';

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    const { error: err } = await authClient.signIn.email({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (err) {
      setError(err.message ?? 'Sign in failed');
      return;
    }
    router.replace('/');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to report and verify bins.</Text>

        <View style={styles.form}>
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@emu.edu.tr" autoCapitalize="none" keyboardType="email-address" />
          <Field label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={submit} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
          </Pressable>

          <Pressable onPress={() => router.replace('/sign-up')}>
            <Text style={styles.switchText}>
              New here? <Text style={styles.switchLink}>Create an account</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  body: { flex: 1, padding: 24 },
  close: { alignSelf: 'flex-end', padding: 8 },
  closeText: { fontSize: 20, color: COLORS.textMuted },
  title: { fontSize: 30, fontWeight: '800', color: COLORS.text, marginTop: 8 },
  subtitle: { fontSize: 15, color: COLORS.textMuted, marginTop: 6 },
  form: { marginTop: 28, gap: 14 },
  error: { color: COLORS.danger, fontSize: 14 },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
    width: '100%',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  switchText: { textAlign: 'center', color: COLORS.textMuted, marginTop: 8 },
  switchLink: { color: COLORS.primary, fontWeight: '600' },
});
