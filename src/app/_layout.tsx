import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { AppShell } from '@/components/AppChrome';

export const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar />
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