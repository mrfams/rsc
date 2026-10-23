/*
 * EMU Bin Tracker service worker.
 *
 * Goals:
 *  - make the installed app start instantly and keep working on a weak campus
 *    connection,
 *  - cache only public, non-personal API reads (bins, config, leaderboard),
 *  - never serve a stale page as if it were live: navigations are network-first.
 *
 * A service worker is required for Chrome/Android to consider the site an
 * installable PWA and show its install prompt.
 */
const VERSION = 'rsc-v4';
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL_URLS = [
  '/',
  '/stats',
  '/download',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-180.png',
  '/og-image.jpg',
  '/og-image.png',
];

/** Public API reads that are safe (and useful) to keep offline. */
const CACHEABLE_APIS = ['/api/bins', '/api/config', '/api/leaderboard', '/api/health'];
const PUBLIC_PAGES = ['/', '/stats', '/download'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individual failures must not block the install (e.g. an offline phone
      // updating the app while the shell is unreachable).
      await Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.startsWith(VERSION))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(ASSET_CACHE);
    cache.put(request, response.clone()).catch(() => {});
    // Hashed bundles change on every deploy. Keep the cache bounded instead
    // of growing it forever across releases.
    const keys = await cache.keys();
    if (keys.length > 220) {
      await Promise.all(keys.slice(0, 40).map((key) => cache.delete(key)));
    }
  }
  return response;
}

function offlinePage() {
  return new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · EMU Bin Tracker</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F3F5F4;color:#101413;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:24px;text-align:center}div{max-width:360px}h1{font-size:22px;margin:0 0 8px}p{margin:0;color:#68726E}</style></head><body><div><h1>You are offline</h1><p>This page has not been saved yet. Reconnect and try again — your map data and sightings will sync automatically.</p></div></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 },
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Personalised and moderation endpoints are never cached or intercepted.
  if (url.pathname.startsWith('/api/')) {
    const cacheable = CACHEABLE_APIS.some(
      (path) => url.pathname === path || url.pathname.startsWith(`${path}/`),
    );
    if (!cacheable) return;
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, SHELL_CACHE, '/').catch(() => offlinePage()),
    );
    return;
  }

  // Hashed JS/CSS bundles, fonts and uploaded photos can be cached forever.
  const isStatic =
    url.pathname.startsWith('/_expo/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/api/photos/') ||
    /\.(png|jpg|jpeg|gif|webp|avif|svg|ico|woff2?|ttf|css|js|json|xml|txt)$/i.test(url.pathname);

  if (isStatic) {
    event.respondWith(cacheFirst(request));
  }
});

/** Let the page ask a waiting worker to take over immediately. */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_CACHES') {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
    );
  }
});

/** Keep the app's public pages up to date when connectivity returns. */
self.addEventListener('sync', (event) => {
  if (event.tag === 'rsc-public-pages') {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        await Promise.allSettled(PUBLIC_PAGES.map((page) => cache.add(page)));
      })(),
    );
  }
});
