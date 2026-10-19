import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme, Appearance } from 'react-native';
import { Stack } from 'expo-router';
import { AppShell } from '@/components/AppChrome';

export const queryClient = new QueryClient();

// Initialize theme from system preference
// Appearance.getColorScheme() can return 'light', 'dark', or 'system'
const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('light');

useEffect(() => {
  // Set initial value
  const getInitialScheme = () => {
    const scheme = Appearance.getColorScheme();
    if (scheme === 'dark') return 'dark';
    if (scheme === 'light') return 'light';
    return 'light'; // default fallback
  };
  setColorScheme(getInitialScheme);

  // Listen for changes
  const listener = Appearance.addChangeListener(({ colorScheme: newScheme }) => {
    if (newScheme === 'dark') setColorScheme('dark');
    else if (newScheme === 'light') setColorScheme('light');
  });
  return () => listener.remove();
}, []);

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>      <StatusBar />
      <AppShell>
        <Stack
          screenOptions={{ headerShown: false, animation: 'default' }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="sign-in" options={{ presentation: 'modal' }} />
          <Stack.Screen name="sign-up" options={{ presentation: 'modal' }} />
          <Stack.Screen name="report/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="report/[id]" />
          <Stack.Screen name="profile" />
        </Stack>
      </AppShell>
    </QueryClientProvider>
  );
}