import { useSyncExternalStore } from 'react';

/**
 * False during server rendering *and* during the first hydration pass, true
 * immediately afterwards.
 *
 * Expo web renders the app on the server, where `useWindowDimensions()`
 * resolves to the server default. Layouts that branch on width therefore have
 * to render the same markup as the server for one pass; flipping the flag
 * during hydration avoids React's "server HTML did not match" error.
 */
let hydrated = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!hydrated) {
    // Runs after the hydration commit, never during render.
    queueMicrotask(() => {
      hydrated = true;
      for (const notify of listeners) notify();
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => hydrated;
const getServerSnapshot = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
