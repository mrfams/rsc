// Learn more https://docs.expo.dev/router/reference/static-rendering/#root-html

import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';

import { APP_WEB_URL } from '@/lib/constants';

/**
 * The root HTML document for every web page.
 *
 * It adds the pieces that turn the site into an installable app: the web app
 * manifest (so “Add to Home Screen” on iPhone gives a real icon and a
 * standalone window instead of a Safari bookmark) and the apple-touch-icon
 * for the home screen.
 *
 * This file is web-only and runs in Node.js — no DOM or browser APIs here.
 */
export default function Root({ children }: { children: React.ReactNode }) {
  const { bodyAttributes, bodyNodes, htmlAttributes, headNodes } = useServerDocumentContext();

  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/* Icons, manifest and apple-web-app tags come from generateMetadata. */}
        <link rel="icon" href="/favicon.ico" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#0E7C5A" />

        {/*
          Structured data for search engines and rich previews. Static, so it
          is part of the first HTML response and never blocks hydration.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'EMU Bin Tracker',
              url: APP_WEB_URL,
              description:
                'Community map of recycling bins across the Eastern Mediterranean University campus.',
              applicationCategory: 'UtilitiesApplication',
              operatingSystem: 'Android, iOS, Web',
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
              publisher: {
                '@type': 'Organization',
                name: 'Recycling & Sustainability Club',
                url: 'https://www.instagram.com/rsemu_club/',
              },
            }),
          }}
        />

        {/*
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native.
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}

        {/*
          PWA wiring: register the service worker after the first paint and
          capture Chrome's install event before React mounts. `beforeinstallprompt`
          can fire earlier than any component, so it is stashed on window for
          the in-app install banner. Chrome's own automatic install UI needs a
          manifest, icons, HTTPS and a fetch-capable service worker — all
          provided by this app.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }
  window.addEventListener('beforeinstallprompt', function (event) {
    // Android Chrome shows its own install prompt; suppressing it there would
    // replace a native browser affordance with a website button. On desktop
    // Chrome only shows the omnibox install icon, so the app captures the
    // event to offer its branded banner.
    var android = /Android/i.test(navigator.userAgent);
    if (!android) event.preventDefault();
    window.__rscInstallPrompt = event;
    window.dispatchEvent(new Event('rsc-install-ready'));
  });
})();
            `.trim(),
          }}
        />
      </body>
    </html>
  );
}
