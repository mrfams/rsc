import 'dotenv/config';
import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';

import {
  captureUserContributions,
  cleanUpUserContributions,
  type UserContributions,
} from './account-service';
import { db } from './db';
import * as authSchema from './db/auth-schema';
import { user } from './db/schema';

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

/* Bins and photos touched by an account deletion, captured before the cascade. */
const deletions = new Map<string, UserContributions>();

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: authSchema,
  }),
  user: {
    deleteUser: {
      enabled: true,
      beforeDelete: async (deletedUser) => {
        deletions.set(deletedUser.id, await captureUserContributions(deletedUser.id));
      },
      afterDelete: async (deletedUser) => {
        const touched = deletions.get(deletedUser.id) ?? { binIds: [], photoPaths: [] };
        deletions.delete(deletedUser.id);
        // The reports were removed by the foreign-key cascade. Their photos
        // are not in the database anymore, so remove the stored objects too.
        await cleanUpUserContributions(touched);
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
    session: {
      create: {
        before: async (createdSession) => {
          // A disabled member must not be able to start a new session, even
          // with valid credentials. Checked here so every auth method obeys it.
          const [row] = await db
            .select({ disabledAt: user.disabledAt })
            .from(user)
            .where(eq(user.id, createdSession.userId))
            .limit(1);
          if (row?.disabledAt) {
            throw new APIError('FORBIDDEN', {
              message: 'This account has been disabled. Contact the sustainability office.',
            });
          }
          return true;
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

/**
 * Current signed-in user for a request, or null.
 *
 * `role` and the disabled flag are read fresh from the database on every API
 * call. Better Auth's session payload only carries the core columns, so a
 * role granted from the admin panel would otherwise be invisible to
 * `isAdminUser` until the user signed in again (and never, for an existing
 * session). Reading here makes promotion, demotion and suspension immediate.
 */
export async function getSessionUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;

  const [row] = await db
    .select({ role: user.role, disabledAt: user.disabledAt })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);
  if (!row || row.disabledAt) return null;

  return { ...session.user, role: row.role ?? null };
}
