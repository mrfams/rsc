/**
 * Server-side category catalogue. Backed by the `categories` table; empty
 * databases self-seed the default set so fresh deploys work immediately.
 */
import { asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { categories, type CategoryRow } from '@/lib/db/schema';

export type CategoryDto = {
  slug: string;
  name: string;
  color: string;
  emoji: string;
  active: boolean;
};

export const DEFAULT_CATEGORIES: Omit<CategoryDto, 'active'>[] = [
  { slug: 'plastic', name: 'Plastic', color: '#0284C7', emoji: '🥤' },
  { slug: 'paper', name: 'Paper', color: '#7C3AED', emoji: '📄' },
  { slug: 'glass', name: 'Glass', color: '#059669', emoji: '🍾' },
  { slug: 'metal', name: 'Metal', color: '#EA580C', emoji: '🥫' },
  { slug: 'battery', name: 'Battery / e-waste', color: '#DC2626', emoji: '🔋' },
  { slug: 'general', name: 'General waste', color: '#52525B', emoji: '🗑️' },
  { slug: 'food_waste', name: 'Food waste', color: '#16A34A', emoji: '🥬' },
];

function mapCategory(row: CategoryRow): CategoryDto {
  return {
    slug: row.slug,
    name: row.name,
    color: row.color,
    emoji: row.emoji,
    active: row.active,
  };
}

/** Insert the default catalogue when the table is empty (idempotent). */
export async function ensureDefaultCategories(): Promise<void> {
  const existing = await db.select({ slug: categories.slug }).from(categories).limit(1);
  if (existing.length > 0) return;
  await db
    .insert(categories)
    .values(DEFAULT_CATEGORIES.map((c) => ({ ...c, active: true })))
    .onConflictDoNothing();
}

export type SlugResult = { valid: false; reason: string } | { valid: true; slug: string };

/** Validate + normalise a category slug (a-z, 0-9, underscore; 1-32 chars). */
export function normalizeSlug(input: string): SlugResult {
  const slug = (input ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (slug.length < 1 || slug.length > 32) {
    return { valid: false, reason: 'Slug must be 1-32 characters' };
  }
  if (!/^[a-z0-9_]+$/.test(slug)) {
    return { valid: false, reason: 'Slug may only contain letters, numbers and underscores' };
  }
  return { valid: true, slug };
}

const HEX = /^#[0-9A-Fa-f]{6}$/;
export function normalizeHex(input: string, fallback = '#0E7490'): string {
  const trimmed = (input ?? '').trim();
  return HEX.test(trimmed) ? trimmed : fallback;
}

export async function listCategories(activeOnly: boolean): Promise<CategoryDto[]> {
  await ensureDefaultCategories();
  const rows = await db.select().from(categories).orderBy(asc(categories.createdAt));
  return rows.map(mapCategory).filter((c) => c.active || !activeOnly);
}

/** True when the slug exists and is an acceptable report target. */
export async function isReportableCategory(slug: string): Promise<boolean> {
  const rows = await db
    .select({ active: categories.active })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  return rows[0]?.active === true;
}
