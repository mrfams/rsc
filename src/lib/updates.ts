/**
 * Over-the-air updates (EAS Update) for the native builds.
 *
 * `expo-updates` is a native module: it only exists inside the installed app,
 * so the web build resolves `updates.web.ts` instead (a no-op with the same
 * API). Screens can therefore call `useAppUpdate()` without caring where they
 * run.
 *
 * How it works in a release build:
 * - the native module checks the EAS Update server on launch and downloads a
 *   new bundle in the background;
 * - `useAppUpdate()` surfaces that state so the UI can offer "Update now";
 * - `apply()` downloads (if needed) and reloads into the new bundle.
 *
 * Development builds and Expo Go cannot load OTA bundles — `supported` is
 * false there and every call is a no-op.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

export type UpdateCheckStatus = 'available' | 'current' | 'unsupported' | 'error';

export type UpdateCheckResult = {
  status: UpdateCheckStatus;
  message: string;
};

export type AppUpdateState = {
  /** Over-the-air updates can run in this build. */
  supported: boolean;
  /** A check or a download is running right now. */
  busy: boolean;
  /** A newer bundle is published for this channel. */
  available: boolean;
  /** The bundle is downloaded and only waiting for a reload. */
  pending: boolean;
  /** Download progress, 0 → 1. */
  progress: number;
  /** Last error message, if any. */
  error: string | null;
  /** EAS Update channel this build follows ("preview", "production"…). */
  channel: string | null;
  /** Runtime version of the running bundle. */
  runtimeVersion: string | null;
};

/** Only release builds can load OTA bundles. */
const isRelease = process.env.NODE_ENV === 'production';

/** Foreground checks are throttled — the native module already checks on launch. */
const FOREGROUND_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export function useAppUpdate(): {
  state: AppUpdateState;
  check: () => Promise<UpdateCheckResult>;
  apply: () => Promise<void>;
} {
  const {
    isUpdateAvailable,
    isUpdatePending,
    isDownloading,
    downloadProgress,
    checkError,
    downloadError,
  } = Updates.useUpdates();

  const supported = isRelease && Updates.isEnabled;
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastCheck = useRef(0);

  const check = useCallback(async (): Promise<UpdateCheckResult> => {
    if (!supported) {
      return {
        status: 'unsupported',
        message: 'Automatic updates are only available in the installed app.',
      };
    }
    setChecking(true);
    setError(null);
    try {
      const result = await Updates.checkForUpdateAsync();
      lastCheck.current = Date.now();
      if (result.isAvailable) {
        return { status: 'available', message: 'A new version is ready to download.' };
      }
      return { status: 'current', message: 'You are on the latest version.' };
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'Could not reach the update server.';
      setError(message);
      return { status: 'error', message };
    } finally {
      setChecking(false);
    }
  }, [supported]);

  const apply = useCallback(async () => {
    if (!supported) return;
    setError(null);
    try {
      if (!isUpdatePending) {
        const result = await Updates.fetchUpdateAsync();
        if (!result.isNew) return;
      }
      // Nothing may run after this: the app restarts into the new bundle.
      await Updates.reloadAsync();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not download the update.');
    }
  }, [supported, isUpdatePending]);

  // Check once on mount and again when the app comes back to the foreground.
  useEffect(() => {
    if (!supported) return;
    // Deferred so the first check never competes with the initial render.
    const timer = setTimeout(() => {
      void check();
    }, 600);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      if (Date.now() - lastCheck.current < FOREGROUND_CHECK_INTERVAL_MS) return;
      void check();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [supported, check]);

  const state: AppUpdateState = {
    supported,
    busy: checking || isDownloading,
    available: isUpdateAvailable,
    pending: isUpdatePending,
    progress: downloadProgress ?? 0,
    error: error ?? checkError?.message ?? downloadError?.message ?? null,
    channel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
  };

  return { state, check, apply };
}
