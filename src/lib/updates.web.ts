/**
 * Web twin of `updates.ts`.
 *
 * The web app is served from Vercel, so a deploy is the "update": there is no
 * OTA bundle to download and the native `expo-updates` module must never be
 * imported in a browser bundle. The API mirrors the native one so screens can
 * call `useAppUpdate()` unconditionally.
 */
import { useCallback, useMemo, useState } from 'react';

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
  /** EAS Update channel this build follows. */
  channel: string | null;
  /** Runtime version of the running bundle. */
  runtimeVersion: string | null;
};

const WEB_STATE: AppUpdateState = {
  supported: false,
  busy: false,
  available: false,
  pending: false,
  progress: 0,
  error: null,
  channel: null,
  runtimeVersion: null,
};

export function useAppUpdate(): {
  state: AppUpdateState;
  check: () => Promise<UpdateCheckResult>;
  apply: () => Promise<void>;
} {
  const [state] = useState<AppUpdateState>(WEB_STATE);

  const check = useCallback(async (): Promise<UpdateCheckResult> => {
    return {
      status: 'unsupported',
      message: 'The web version updates itself — reload the page to get the latest build.',
    };
  }, []);

  const apply = useCallback(async () => {
    // Nothing to apply on the web.
  }, []);

  return useMemo(() => ({ state, check, apply }), [state, check, apply]);
}
