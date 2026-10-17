import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const baseURL =
  Platform.OS === 'web'
    ? undefined // same-origin — Better Auth figures out the rest
    : (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8081');

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    expoClient({
      scheme: 'rsc',
      storagePrefix: 'rsc',
      storage: SecureStore,
    }),
  ],
});

export const { useSession } = authClient;
