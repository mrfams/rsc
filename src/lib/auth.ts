import 'dotenv/config';
import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import { db } from './db';
import * as authSchema from './db/auth-schema';

const dev = process.env.NODE_ENV !== 'production';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
    // Default Better Auth password policy applies (min 8 chars).
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
