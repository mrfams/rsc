import { binCategoryEnum, binStatusEnum } from '@/lib/db/schema';
import { z } from 'zod';

/** Shared client+server schemas. No server secrets may live here. */

export const reportSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  category: z.enum(binCategoryEnum.enumValues),
  note: z.string().max(500).optional(),
  /** data:image/jpeg;base64,… — client-compressed, ≤ ~400 KB decoded. */
  photoBase64: z.string().max(600_000).optional(),
});

export type ReportInput = z.infer<typeof reportSchema>;

export const BIN_CATEGORY_EMOJI: Record<(typeof binCategoryEnum.enumValues)[number], string> = {
  plastic: '🥤',
  paper: '📄',
  glass: '🍾',
  metal: '🥫',
  battery: '🔋',
  general: '🗑️',
};

export const binStatusSchema = z.enum(binStatusEnum.enumValues);
export type BinStatusInput = z.infer<typeof binStatusSchema>;
export type BinStatus = (typeof binStatusEnum.enumValues)[number];
export { binStatusEnum };

export const BIN_STATUS_LABEL: Record<(typeof binStatusEnum.enumValues)[number], string> = {
  pending: 'Pending',
  verified: 'Verified',
  disputed: 'Disputed',
  removed: 'Removed',
};
