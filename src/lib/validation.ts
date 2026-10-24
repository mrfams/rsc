import { binStatusEnum } from '@/lib/db/schema';
import { z } from 'zod';

/** Shared client+server schemas. No server secrets may live here. */

export const reportSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Category slug; validated against the active catalogue server-side. */
  category: z.string().min(1).max(32).regex(/^[a-z0-9_]+$/),
  /** Optional place name; the server falls back to the nearest campus place. */
  name: z.string().max(80).optional(),
  note: z.string().max(500).optional(),
  /** Number of bins this sighting refers to (for batch/cluster reports). Must be at least 1. */
  binCount: z.number().int().min(1),
  /**
   * data:image/jpeg;base64,… — the client compresses to ≤ 900 KB, which is
   * ~1.2 M base64 characters. The server decodes and enforces the real 1 MB
   * byte limit in `photo-storage.ts`; this cap only rejects absurd payloads
   * before they are decoded.
   */
  photoBase64: z.string().max(1_400_000).optional(),
});

export type ReportInput = z.infer<typeof reportSchema>;

/** Known emoji per slug; anything the admin adds falls back to ♻️. */
export const BIN_CATEGORY_EMOJI: Record<string, string> = {
  plastic: '🥤',
  paper: '📄',
  glass: '🍾',
  metal: '🥫',
  battery: '🔋',
  general: '🗑️',
  food_waste: '🥬',
};

export const DEFAULT_CATEGORY_EMOJI = '♻️';

export function categoryEmoji(slug: string): string {
  return BIN_CATEGORY_EMOJI[slug] ?? DEFAULT_CATEGORY_EMOJI;
}

export const binStatusSchema = z.enum(binStatusEnum.enumValues);

export const adminBinCreateSchema = z.object({
  name: z.string().min(1).max(80),
  category: z.string().min(1).max(32).regex(/^[a-z0-9_]+$/),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  status: binStatusSchema.optional(),
  /** Optional photo of the real bin; stored as the admin's first sighting. */
  photoBase64: z.string().max(1_400_000).optional(),
});

export const adminBinUpdateSchema = z
  .object({
    name: z.string().max(80).nullable().optional(),
    category: z.string().min(1).max(32).regex(/^[a-z0-9_]+$/).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    status: binStatusSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.category !== undefined ||
      value.status !== undefined ||
      (value.lat !== undefined && value.lng !== undefined),
    { message: 'Nothing to update' },
  );
export type BinStatusInput = z.infer<typeof binStatusSchema>;
export type BinStatus = (typeof binStatusEnum.enumValues)[number];
export { binStatusEnum };

export const BIN_STATUS_LABEL: Record<(typeof binStatusEnum.enumValues)[number], string> = {
  pending: 'Pending',
  verified: 'Verified',
  disputed: 'Disputed',
  removed: 'Removed',
};
