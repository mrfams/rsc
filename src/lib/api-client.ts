import { Platform } from 'react-native';

import { authClient } from '@/lib/auth-client';

/**
 * Typed fetch wrapper for the app's own API routes.
 *
 * - Web: same-origin, cookies flow automatically.
 * - Native: the Expo dev/prod origin differs; EXPO_PUBLIC_API_URL must point
 *   at the deployed server, and the session cookie is attached manually from
 *   SecureStore (this is what the Better Auth Expo plugin requires).
 */
const BASE =
  Platform.OS === 'web'
    ? ''
    : (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8081');

export type ApiError = Error & { status?: number };

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const finalHeaders: Record<string, string> = { ...(headers as Record<string, string> | undefined) };

  if (json !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  if (Platform.OS !== 'web') {
    const cookie = await authClient.getCookie();
    if (cookie) finalHeaders.Cookie = cookie;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: 'include',
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body?.error === 'string') message = body.error;
    } catch {
      // keep the generic message
    }
    const err: ApiError = new Error(message);
    err.status = res.status;
    throw err;
  }

  return (await res.json()) as T;
}
