import {
  doublePrecision,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth-schema';

export { user, session, account, verification } from './auth-schema';

/**
 * High-level waste category of a bin.
 */
export const binCategoryEnum = pgEnum('bin_category', [
  'plastic',
  'paper',
  'glass',
  'metal',
  'battery',
  'general',
]);

/**
 * Lifecycle of a bin:
 * - pending: reported, not yet confirmed by a second person
 * - verified: confirmed by at least one other member
 * - disputed: community flagged it as wrong/missing
 * - removed: moderation retired it
 */
export const binStatusEnum = pgEnum('bin_status', [
  'pending',
  'verified',
  'disputed',
  'removed',
]);

/**
 * A physical recycling bin on campus. Created lazily: the first report within
 * ~25 m of an unused location spawns a bin; later reports link to it.
 */
export const bins = pgTable(
  'bins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    category: binCategoryEnum('category').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    area: text('area'),
    status: binStatusEnum('status').notNull().default('pending'),
    reportCount: doublePrecision('report_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('bins_location_idx').on(table.lat, table.lng),
    index('bins_status_idx').on(table.status),
  ],
);

/**
 * Individual community reports. Each report either found the bin in place
 * (confirm) or is an addition/new sighting (new). Reports are immutable
 * history; the bin row carries the aggregated state.
 */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    binId: uuid('bin_id')
      .notNull()
      .references(() => bins.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    userEmail: text('user_email').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    note: text('note'),
    photoPath: text('photo_path'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('reports_bin_idx').on(table.binId),
    index('reports_user_idx').on(table.userId),
    index('reports_created_idx').on(table.createdAt),
  ],
);

export const pushTokens = pgTable(
  'push_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Expo push token, e.g. ExponentPushToken[…] */
    token: text('token').notNull().unique(),
    platform: text('platform').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('push_tokens_user_idx').on(table.userId)],
);

export type Bin = typeof bins.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type PushToken = typeof pushTokens.$inferSelect;
export type BinCategory = (typeof binCategoryEnum.enumValues)[number];
export type BinStatus = (typeof binStatusEnum.enumValues)[number];
