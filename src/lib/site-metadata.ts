import type { Metadata } from 'expo-router/server';

import { APP_WEB_URL } from '@/lib/constants';

export const SITE_NAME = 'EMU Bin Tracker';
export const SITE_DESCRIPTION =
  'Find recycling bins across the EMU campus, add a sighting with a photo, and see the community map and leaderboard.';

/** Absolute URL: social crawlers do not resolve relative image paths. */
export const OG_IMAGE_URL = `${APP_WEB_URL}/og-image.png`;

const OG_IMAGE = {
  url: OG_IMAGE_URL,
  secureUrl: OG_IMAGE_URL,
  width: 1200,
  height: 630,
  type: 'image/png',
  alt: 'EMU Bin Tracker — a community map of recycling bins across the EMU campus',
};

type PageMetadataOptions = {
  /** Page title without the site suffix, e.g. "Campus recycling stats". */
  title?: string;
  description?: string;
  /** Route path, e.g. "/stats". Adds a canonical URL and og:url. */
  path?: string;
  /** Keep account and moderation pages out of search results. */
  noIndex?: boolean;
};

/**
 * Shared Open Graph / Twitter metadata for server-rendered pages.
 *
 * Expo Router calls this on the server before rendering, so crawlers get the
 * tags in the first HTML response instead of waiting for hydration. Every
 * sharing surface (WhatsApp, Telegram, Slack, X, Discord, iMessage) reads
 * these tags, so the image is always an absolute URL.
 */
export function siteMetadata({
  title,
  description = SITE_DESCRIPTION,
  path,
  noIndex = false,
}: PageMetadataOptions = {}): Metadata {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const url = path ? `${APP_WEB_URL}${path}` : APP_WEB_URL;

  return {
    title: fullTitle,
    description,
    applicationName: SITE_NAME,
    keywords: [
      'EMU',
      'Eastern Mediterranean University',
      'recycling bins',
      'campus map',
      'sustainability',
      'Northern Cyprus',
    ],
    authors: [{ name: 'Recycling & Sustainability Club', url: APP_WEB_URL }],
    creator: 'Recycling & Sustainability Club',
    publisher: 'Recycling & Sustainability Club',
    category: 'community',
    alternates: { canonical: url },
    robots: noIndex
      ? { index: false, follow: true }
      : {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
        },
    formatDetection: { telephone: false, address: false, email: false },
    openGraph: {
      title: fullTitle,
      description,
      siteName: SITE_NAME,
      locale: 'en_US',
      type: 'website',
      images: [OG_IMAGE],
      url,
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [{ url: OG_IMAGE_URL, alt: OG_IMAGE.alt }],
    },
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
        { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
      ],
      shortcut: '/favicon.ico',
      apple: { url: '/icon-180.png', sizes: '180x180', type: 'image/png' },
    },
    manifest: '/manifest.json',
    appleWebApp: {
      title: 'EMU Bins',
      statusBarStyle: 'default',
    },
  };
}
