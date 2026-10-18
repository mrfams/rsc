/**
 * Offline support:
 * - a persistent queue for report submissions that ran while the network was
 *   down (AsyncStorage on native, localStorage on web — same API), and
 * - a manual drain, called from the map screen when connectivity returns.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from '@/lib/api-client';
import type { ReportInput } from '@/lib/validation';

const QUEUE_KEY = 'rsc.pending-reports';

export type PendingReport = ReportInput & { queuedAt: string };

export async function loadQueue(): Promise<PendingReport[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as PendingReport[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: PendingReport[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // storage full / blocked — drop silently; the report can be re-made
  }
}

/** Queue a report that failed due to a network outage. */
export async function enqueueReport(input: ReportInput): Promise<void> {
  const queue = await loadQueue();
  queue.push({ ...input, queuedAt: new Date().toISOString() });
  await saveQueue(queue);
}

/**
 * Try to send every queued report. Reports whose failure was a *server*
 * rejection (validation, geofence, auth) are dropped — re-trying them would
 * never succeed. Only network failures stay queued.
 */
export async function drainQueue(): Promise<number> {
  const queue = await loadQueue();
  const remaining: PendingReport[] = [];
  let sent = 0;

  while (queue.length > 0) {
    const item = queue.shift()!;
    const { queuedAt: _queuedAt, ...body } = item;
    try {
      await api('/api/reports', { method: 'POST', json: body });
      sent += 1;
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status == null) {
        remaining.push(item); // still offline — keep for later
        remaining.push(...queue);
        break;
      }
      // server said no (401/422/413…) — retrying can't help, drop it
    }
  }

  await saveQueue(remaining);
  return sent;
}

export async function queueCount(): Promise<number> {
  return (await loadQueue()).length;
}
