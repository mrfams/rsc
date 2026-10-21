/**
 * Older builds stored a boilerplate note when a member confirmed a sighting
 * ("Seen in place"). It carries no information for readers, so it is treated
 * as "no note" everywhere a note is displayed. New sightings simply store no
 * note at all.
 */
export const LEGACY_SIGHTING_NOTE = 'Seen in place';

export function displayNote(note: string | null | undefined): string | null {
  const value = note?.trim();
  if (!value || value === LEGACY_SIGHTING_NOTE) return null;
  return value;
}
