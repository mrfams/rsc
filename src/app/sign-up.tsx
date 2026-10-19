import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Field } from '@/components/ui/Field';
import { authClient } from '@/lib/auth-client';
import { COLORS } from '@/lib/constants';

export default function SignUpScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    const { error: err } = await authClient.signUp.email({
      name: name.trim() || email.split('@')[0],
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (err) {
      setError(err.message ?? 'Sign up failed');
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

        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Join the campus recycling map. A campus email (@emu.edu.tr) is required.</Text>

        <View style={styles.form}>
          <Field label="Name" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@emu.edu.tr" autoCapitalize="none" keyboardType="email-address" />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Min. 8 chars, letters + numbers"
            secureTextEntry
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={submit} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? 'Creating…' : 'Create account'}</Text>
          </Pressable>

          <Pressable onPress={() => router.replace('/sign-in')}>
            <Text style={styles.switchText}>
              Already registered? <Text style={styles.switchLink}>Sign in</Text>
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
