import 'dotenv/config';
import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { eq, inArray, sql } from 'drizzle-orm';

import { db } from './db';
import * as authSchema from './db/auth-schema';
import { bins, reports } from './db/schema';

const dev = process.env.NODE_ENV !== 'production';

/** Emails granted moderation powers in /admin (comma-separated env list). */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/**
 * Admin powers come from two places: the `role` column (an admin can promote
 * others from /admin) and the ADMIN_EMAILS env bootstrap list. Either passes.
 */
export function isAdminUser(user: { email: string; role?: string | null } | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || isAdminEmail(user.email);
}

/* Bin ids touched by an account deletion, used to rebuild their aggregates. */
const binsForDeletion = new Map<string, string[]>();

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: authSchema,
  }),
  user: {
    deleteUser: {
      enabled: true,
      beforeDelete: async (deletedUser) => {
        const rows = await db
          .select({ binId: reports.binId })
          .from(reports)
          .where(eq(reports.userId, deletedUser.id));
        binsForDeletion.set(deletedUser.id, [...new Set(rows.map((row) => row.binId))]);
      },
      afterDelete: async (deletedUser) => {
        const affected = binsForDeletion.get(deletedUser.id) ?? [];
        binsForDeletion.delete(deletedUser.id);
        if (affected.length === 0) return;
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
            .where(inArray(bins.id, affected));
        } catch (error) {
          // The account is already gone; leave the map usable and log the gap.
          console.error('Could not rebuild bin aggregates after account deletion', error);
        }
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    // Default Better Auth password policy applies (min 8 chars).
  },
  databaseHooks: {
    user: {
      create: {
        before: async (created) => {
          // Anyone can join; staff accounts bootstrap straight into admin.
          if (isAdminEmail(created.email)) {
            (created as { role?: string }).role = 'admin';
          }
        },
      },
    },
  },
  advanced: {
    // Vercel (and any proxy) forwards the real client address. Without this,
    // Better Auth rate-limits every visitor in one shared bucket.
    ipAddress: {
      ipAddressHeaders: ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip'],
    },
  },
  plugins: [expo()],
  trustedOrigins: [
    'rsc://',
    // Dev servers and Expo Go/dev-client deep links run on arbitrary local
    // ports and exp:// origins; trust them only outside production.
    ...(dev ? ['exp://**', 'http://localhost:*', 'http://127.0.0.1:*', 'http://[::1]:*'] : []),
    // Deployment origins (production + Vercel previews).
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
    ...(process.env.APP_URL ? [process.env.APP_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(dev ? [] : ['https://*.vercel.app']),
  ],
});

/** Current signed-in user for a request, or null. */
export async function getSessionUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}
