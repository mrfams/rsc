/**
 * Account lifecycle helpers shared by self-service deletion and moderation.
 *
 * Deleting a member must never leave orphaned photos or stale bin aggregates:
 * reports cascade away with the user row, but stored images and the derived
 * `reportCount`/`status` need explicit cleanup.
 */
import { eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { bins, pushTokens, reports, session, user } from '@/lib/db/schema';
import { deletePhotos } from '@/lib/photo-storage';

export type UserContributions = {
  binIds: string[];
  photoPaths: string[];
};

/** Snapshot what a member touched before their reports are cascaded away. */
export async function captureUserContributions(userId: string): Promise<UserContributions> {
  const rows = await db
    .select({ binId: reports.binId, photoPath: reports.photoPath })
    .from(reports)
    .where(eq(reports.userId, userId));

  return {
    binIds: [...new Set(rows.map((row) => row.binId))],
    photoPaths: rows
      .map((row) => row.photoPath)
      .filter((value): value is string => Boolean(value)),
  };
}

/**
 * Remove stored photos and rebuild the bins the member contributed to.
 *
 * Status is recomputed from the remaining independent sightings; a moderation
 * decision (removed/disputed) is preserved so deleting a spammer does not
 * silently un-hide a bin a moderator already retired.
 */
export async function cleanUpUserContributions(touched: UserContributions): Promise<void> {
  if (touched.photoPaths.length > 0) {
    await deletePhotos(touched.photoPaths);
  }
  if (touched.binIds.length === 0) return;

  try {
    await db
      .update(bins)
      .set({
        reportCount: sql`(select count(*)::double precision from ${reports} where ${reports.binId} = ${bins.id})`,
        status: sql`case
          when ${bins.status} in ('removed', 'disputed') then ${bins.status}
          when (select count(distinct ${reports.userId}) from ${reports} where ${reports.binId} = ${bins.id}) >= 2 then 'verified'::bin_status
          else 'pending'::bin_status
        end`,
        updatedAt: new Date(),
      })
      .where(inArray(bins.id, touched.binIds));
  } catch (error) {
    // The account is already gone; leave the map usable and log the gap.
    console.error('[account] could not rebuild bin aggregates after deletion', error);
  }
}

/** Permanently delete an account, its sessions, reports and stored photos. */
export async function purgeUserAccount(userId: string): Promise<boolean> {
  const touched = await captureUserContributions(userId);
  const deleted = await db
    .delete(user)
    .where(eq(user.id, userId))
    .returning({ id: user.id });
  if (deleted.length === 0) return false;

  await cleanUpUserContributions(touched);
  return true;
}

/**
 * Disable or re-enable a member.
 *
 * Disabling revokes every active session and push token immediately, so the
 * account stops working on devices that were already signed in. The reports
 * stay — the contribution history is still valid.
 */
export async function setUserDisabled(userId: string, disabled: boolean): Promise<boolean> {
  const updated = await db
    .update(user)
    .set({ disabledAt: disabled ? new Date() : null, updatedAt: new Date() })
    .where(eq(user.id, userId))
    .returning({ id: user.id });
  if (updated.length === 0) return false;

  if (disabled) {
    await Promise.all([
      db.delete(session).where(eq(session.userId, userId)),
      db.delete(pushTokens).where(eq(pushTokens.userId, userId)),
    ]);
  }
  return true;
}
