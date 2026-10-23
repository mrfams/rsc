import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import Constants from 'expo-constants';

import { resolveApiBase } from '@/lib/api-base';
import { authClient } from '@/lib/auth-client';
import { APP_WEB_URL } from '@/lib/constants';

/**
 * Typed fetch wrapper for the app's own API routes.
 *
 * - Web: same-origin, cookies flow automatically.
 * - Native: see `resolveApiBase` — a physical dev build falls back to Metro's
 *   LAN address instead of the baked-in localhost URL (which is the phone
 *   itself), and signed builds use the deployed server. The session cookie is
 *   attached manually from SecureStore (what the Better Auth Expo plugin
 *   requires).
 */
const BASE = resolveApiBase({
  platform: Platform.OS,
  // `APP_WEB_URL` is the fallback so an over-the-air update that was bundled
  // without `EXPO_PUBLIC_API_URL` still talks to the deployed API instead of
  // the phone itself (`http://localhost:8081`).
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? APP_WEB_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

export type ApiError = Error & { status?: number };

/**
 * Last-known public data, so the map still opens with bins on a dead
 * connection (native and browsers without the service worker). Personal and
 * moderation endpoints are never cached.
 */
const CACHE_PREFIX = 'rsc.api-cache:';
const CACHEABLE_PATHS = new Set(['/api/bins', '/api/config', '/api/leaderboard']);

function cacheKeyFor(path: string): string | null {
  const base = path.split('?')[0];
  if (CACHEABLE_PATHS.has(base)) return `${CACHE_PREFIX}${base}`;
  if (/^\/api\/bins\/[0-9a-f-]{16,}$/i.test(base)) return `${CACHE_PREFIX}${base}`;
  return null;
}

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

  const method = (rest.method ?? 'GET').toUpperCase();
  const cacheKey = method === 'GET' ? cacheKeyFor(path) : null;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: 'include',
    });
  } catch (error) {
    if (cacheKey) {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) return JSON.parse(cached) as T;
      } catch {
        // Corrupt cache: fall through to the network error.
      }
    }
    throw error;
  }

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

  const data = (await res.json()) as T;
  if (cacheKey) {
    void AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => {});
  }
  return data;
}
