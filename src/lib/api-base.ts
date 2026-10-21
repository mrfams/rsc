/**
 * Where the *native* app sends API requests (web is always same-origin).
 *
 * The naive rule — read `EXPO_PUBLIC_API_URL` — breaks on a physical device:
 * the value baked into a local dev build is usually `http://localhost:8081`,
 * which is the phone itself, so every request fails and the map stays empty.
 *
 * Resolution order:
 * 1. A non-loopback `EXPO_PUBLIC_API_URL` (EAS builds bake the deployed
 *    server into the bundle) always wins.
 * 2. Otherwise use Metro's published `hostUri` from expo-constants — the LAN
 *    address of the machine running `expo start`, which serves the API routes
 *    on the same port in development.
 * 3. Otherwise fall back to the configured value / localhost (simulators).
 *
 * Pure and dependency-free so it can be unit-tested with tsx.
 */

export type ApiBaseInput = {
  platform: 'web' | 'ios' | 'android' | string;
  apiUrl?: string | undefined;
  hostUri?: string | undefined;
};

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isLoopbackUrl(value: string): boolean {
  try {
    // URL.hostname keeps IPv6 brackets: "[::1]".
    const host = new URL(value).hostname.replace(/^\[|\]$/g, '');
    return LOOPBACK_HOSTS.has(host);
  } catch {
    return false;
  }
}

/**
 * `hostUri` looks like `192.168.1.7:8081`, `localhost:8081` or `[::1]:8081`.
 * Returns an origin such as `http://192.168.1.7:8081`, or null when unusable.
 */
export function originFromHostUri(hostUri: string): string | null {
  const trimmed = hostUri.trim();
  if (!trimmed) return null;

  let host: string;
  let port: string;
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    if (end === -1) return null;
    host = trimmed.slice(0, end + 1);
    port = trimmed.slice(end + 2);
  } else {
    const idx = trimmed.lastIndexOf(':');
    if (idx === -1) return null;
    host = trimmed.slice(0, idx);
    port = trimmed.slice(idx + 1);
  }
  if (!host || !port || !/^\d+$/.test(port)) return null;
  return `http://${host}:${port}`;
}

export function resolveApiBase({ platform, apiUrl, hostUri }: ApiBaseInput): string {
  if (platform === 'web') return '';

  const configured = apiUrl?.trim() ? stripTrailingSlash(apiUrl.trim()) : '';

  if (configured && !isLoopbackUrl(configured)) return configured;

  const fromHost = hostUri ? originFromHostUri(hostUri) : null;
  if (fromHost) return fromHost;

  return configured || 'http://localhost:8081';
}
