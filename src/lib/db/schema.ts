import {
  boolean,
  doublePrecision,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { user } from './auth-schema';

export { user, session, account, verification } from './auth-schema';

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
 * Waste categories are admin-managed rows now (add "food waste", deactivate
 * one, recolour it…). `bins.category` stores the category **slug** as plain
 * text so deactivating a category never breaks historical bins.
 */
export const categories = pgTable('categories', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  emoji: text('emoji').notNull().default('♻️'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A physical recycling bin on campus. Created lazily: the first report within
 * ~25 m of an unused location spawns a bin; later reports link to it.
 */
export const bins = pgTable(
  'bins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** FK → categories.slug (validated at write time; no cascade so history is safe). */
    category: text('category').notNull().references((): AnyPgColumn => categories.slug),
    /** Human place name, e.g. "DAU 3 Dormitory" or "Outside the library". */
    name: text('name'),
    /** Campus place name, e.g. "Faculty of Civil Engineering", "Central Cafeteria". */
    placeName: text('place_name'),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    area: text('area'),
    status: binStatusEnum('status').notNull().default('pending'),
    reportCount: doublePrecision('report_count').notNull().default(0),
    binCount: doublePrecision('bin_count').notNull().default(0),
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

/**
 * User-contributed edit suggestions for bins.
 * Normal users submit these; admins review and verify/reject them.
 */
export const editSuggestions = pgTable('edit_suggestions', {
  id: uuid('id').primaryKey().defaultRandom(),
  binId: text('bin_id').notNull().references(() => bins.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  userEmail: text('user_email').notNull(),
  name: text('name'),
  category: text('category'),
  area: text('area'),
  status: text('status').notNull().default('pending'), // pending, verified, rejected
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
});

/**
 * Kitchen-sink key/value store for server-editable settings.
 * Key `campus_polygon` holds the geofence polygon the admin can re-draw.
 */
export const appConfig = pgTable('app_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON-encoded payload
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Bin = typeof bins.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type PushToken = typeof pushTokens.$inferSelect;
/** Category is always a category slug (validated against the DB on write). */
export type BinCategory = string;
export type CategoryRow = typeof categories.$inferSelect;
export type BinStatus = (typeof binStatusEnum.enumValues)[number];
