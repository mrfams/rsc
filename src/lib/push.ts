/**
 * Server-side push delivery via the Expo push service.
 * Never import from client code — expo-server-sdk is server-only.
 */
import { Expo } from 'expo-server-sdk';

import { db } from '@/lib/db';
import { pushTokens } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

const expo = new Expo();

/** Expo push tokens look like ExponentPushToken[…]; validate before storing. */
export function isValidExpoPushToken(token: string): boolean {
  return Expo.isExpoPushToken(token);
}

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

/** Send to a set of user ids (deduplicated); bad tokens are pruned. */
export async function sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0) return;

  let tokens: { token: string; userId: string }[];
  try {
    tokens = await db
      .select({ token: pushTokens.token, userId: pushTokens.userId })
      .from(pushTokens)
      .where(inArray(pushTokens.userId, userIds));
  } catch {
    return; // push is best-effort; never break the parent request
  }
  if (tokens.length === 0) return;

  const messages = tokens.map(({ token }) => ({
    to: token,
    sound: 'default' as const,
    title: payload.title,
    body: payload.body,
    data: payload.data,
  }));

  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      // Prune tokens the device registry says are unusable.
      const invalid = new Set<string>();
      for (let i = 0; i < chunk.length; i++) {
        const ticket = tickets[i];
        const token = chunk[i].to;
        if (
          ticket?.status === 'error' &&
          ticket.details?.error === 'DeviceNotRegistered' &&
          typeof token === 'string'
        ) {
          invalid.add(token);
        }
      }
      if (invalid.size > 0) {
        for (const token of invalid) {
          await db.delete(pushTokens).where(eq(pushTokens.token, token));
        }
      }
    } catch {
      // network/API hiccup — skip this chunk quietly
    }
  }
}
