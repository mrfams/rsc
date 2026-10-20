import { Ionicons } from '@expo/vector-icons';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/AppChrome';
import { FeedbackProvider } from '@/components/ui/Feedback';
import { COLORS } from '@/lib/constants';
import { useHydrated } from '@/lib/use-hydrated';

export const queryClient = new QueryClient();

/**
 * The app is rendered to HTML on the server. Anything that depends on the
 * viewport, the session cookie or the clock differs there, which used to
 * trigger React hydration errors (and the odd blank flash). We render the same
 * tiny splash on the server and the first client pass, then mount the real app.
 */
export default function RootLayout() {
  const hydrated = useHydrated();

  return (
    <QueryClientProvider client={queryClient}>
      <FeedbackProvider>
        <StatusBar style="dark" />
        {hydrated ? (
          <AppShell>
            <Stack screenOptions={{ headerShown: false, animation: 'default' }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="sign-in" options={{ presentation: 'modal' }} />
              <Stack.Screen name="sign-up" options={{ presentation: 'modal' }} />
              <Stack.Screen name="report/new" options={{ presentation: 'modal' }} />
              <Stack.Screen name="report/[id]" />
              <Stack.Screen name="profile" />
            </Stack>
          </AppShell>
        ) : (
          <Splash />
        )}
      </FeedbackProvider>
    </QueryClientProvider>
  );
}

function Splash() {
  return (
    <View style={styles.splash}>
      <View style={styles.mark}>
        <Ionicons name="leaf" size={30} color="#FFFFFF" />
      </View>
      <Text style={styles.title}>EMU Bin Tracker</Text>
      <Text style={styles.subtitle}>Sustainability map</Text>
      <ActivityIndicator color={COLORS.primary} style={{ marginTop: 18 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
    gap: 2,
  },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: COLORS.textMuted },
});
