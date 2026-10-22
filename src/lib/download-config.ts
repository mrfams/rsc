/**
 * The Android install link, stored server-side.
 *
 * Every EAS build produces a new APK artifact URL, so the link cannot live in
 * the bundle alone: the admin pastes the new URL in /admin → Overview and the
 * download page (and its QR code) points at it immediately — no rebuild, no
 * app update. The constant in `constants.ts` is the fallback.
 */
import { eq } from 'drizzle-orm';

import { ANDROID_DOWNLOAD_URL } from '@/lib/constants';
import { db } from '@/lib/db';
import { appConfig } from '@/lib/db/schema';

export const ANDROID_DOWNLOAD_KEY = 'android_download_url';

/** Only https links are accepted — the QR code is scanned by other phones. */
export function isValidDownloadUrl(value: string): boolean {
  return /^https:\/\/[^\s]+$/i.test(value.trim());
}

export async function getAndroidDownloadUrl(): Promise<string> {
  try {
    const rows = await db
      .select({ value: appConfig.value })
      .from(appConfig)
      .where(eq(appConfig.key, ANDROID_DOWNLOAD_KEY))
      .limit(1);
    const stored = rows[0]?.value?.trim();
    if (stored && isValidDownloadUrl(stored)) return stored;
  } catch {
    // DB hiccup → fall through to the bundled default.
  }
  return ANDROID_DOWNLOAD_URL;
}

export async function setAndroidDownloadUrl(url: string): Promise<string> {
  const value = url.trim();
  if (!isValidDownloadUrl(value)) {
    throw new Error('The download link must be a full https:// URL');
  }
  await db
    .insert(appConfig)
    .values({ key: ANDROID_DOWNLOAD_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value, updatedAt: new Date() },
    });
  return value;
}
