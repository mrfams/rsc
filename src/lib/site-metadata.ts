import type { Metadata } from 'expo-router/server';

import { APP_WEB_URL } from '@/lib/constants';

export const SITE_NAME = 'EMU Bin Tracker';
export const SITE_DESCRIPTION =
  'Find recycling bins across the EMU campus, add a sighting with a photo, and see the community map and leaderboard.';

/** Absolute URL: social crawlers do not resolve relative image paths. */
export const OG_IMAGE_URL = `${APP_WEB_URL}/og-image.png`;

const OG_IMAGE = {
  url: OG_IMAGE_URL,
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
 * tags in the first HTML response instead of waiting for hydration.
 */
export function siteMetadata({
  title,
  description = SITE_DESCRIPTION,
  path,
  noIndex = false,
}: PageMetadataOptions = {}): Metadata {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const url = path ? `${APP_WEB_URL}${path}` : undefined;

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
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: {
      title: fullTitle,
      description,
      siteName: SITE_NAME,
      locale: 'en_US',
      type: 'website',
      images: [OG_IMAGE],
      ...(url ? { url } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [OG_IMAGE_URL],
    },
    icons: {
      icon: '/favicon.ico',
      apple: '/icon-180.png',
    },
    manifest: '/manifest.json',
    ...(noIndex ? { robots: { index: false, follow: true } } : {}),
  };
}
