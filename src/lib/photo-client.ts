/**
 * Shared client-side photo pipeline.
 *
 * Phone cameras produce multi-megabyte JPEGs. The server accepts 1 MB after
 * base64 decoding, so we progressively resize and recompress until the file
 * fits instead of failing the whole sighting with a 413. Kept in one module so
 * the add-bin form, the bin card and the admin map studio all behave the same.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Server cap is 1 MB; keep a small safety margin for base64 rounding. */
export const MAX_CLIENT_PHOTO_BYTES = 900_000;

type PreparedPhoto = {
  /** Local preview URI. */
  uri: string;
  /** Data URL ready to send as `photoBase64`. */
  base64: string;
  bytes: number;
};

const ATTEMPTS = [
  { width: 1280, quality: 0.72 },
  { width: 1080, quality: 0.6 },
  { width: 900, quality: 0.5 },
  { width: 720, quality: 0.4 },
] as const;

function decodedBytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export async function preparePhoto(uri: string): Promise<PreparedPhoto> {
  let smallest: PreparedPhoto | null = null;

  for (const attempt of ATTEMPTS) {
    const image = await ImageManipulator.manipulate(uri)
      .resize({ width: attempt.width })
      .renderAsync();
    const saved = await image.saveAsync({
      compress: attempt.quality,
      format: SaveFormat.JPEG,
      base64: true,
    });

    if (!saved.base64) {
      throw new Error('Could not process that photo. Try another one.');
    }

    const prepared: PreparedPhoto = {
      uri: saved.uri,
      base64: `data:image/jpeg;base64,${saved.base64}`,
      bytes: decodedBytes(saved.base64),
    };

    if (!smallest || prepared.bytes < smallest.bytes) smallest = prepared;
    if (prepared.bytes <= MAX_CLIENT_PHOTO_BYTES) return prepared;
  }

  // The smallest attempt is the best we can offer. Let the server decide, but
  // make the limit visible instead of failing silently.
  if (smallest && smallest.bytes <= 1_000_000) return smallest;
  throw new Error('That photo is too large. Try a smaller or simpler picture.');
}
