import 'dotenv/config';
import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import { db } from './db';
import * as authSchema from './db/auth-schema';

const dev = process.env.NODE_ENV !== 'production';

/**
 * Campus email gate (verification wave #0): only sign-ups from these domains
 * are accepted. Comma-separated; default is EMU mail. Emails listed in
 * ADMIN_EMAILS (seeded staff accounts) are exempt.
 */
const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS ?? 'emu.edu.tr')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

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

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
    // Default Better Auth password policy applies (min 8 chars).
  },
  databaseHooks: {
    user: {
      create: {
        before: async (created) => {
          const email = created.email?.toLowerCase() ?? '';
          const isStaffEmail = isAdminEmail(email);
          const at = email.lastIndexOf('@');
          const domain = at >= 0 ? email.slice(at + 1) : '';
          if (
            ALLOWED_EMAIL_DOMAINS.length > 0 &&
            !isStaffEmail &&
            !ALLOWED_EMAIL_DOMAINS.includes(domain)
          ) {
            throw new APIError('BAD_REQUEST', {
              message: `Sign-up needs a campus email (${ALLOWED_EMAIL_DOMAINS.join(', ')})`,
            });
          }
          // Staff accounts bootstrap straight into the admin role.
          if (isStaffEmail) (created as { role?: string }).role = 'admin';
        },
      },
    },
  },
  plugins: [expo()],
  trustedOrigins: [
    'rsc://',
    // Development: Expo Go / dev clients deep-link with exp:// and local IPs.
    ...(dev ? ['exp://**'] : []),
  ],
});

/** Current signed-in user for a request, or null. */
export async function getSessionUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}
