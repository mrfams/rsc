/**
 * Older builds stored a boilerplate note when a member confirmed a sighting
 * ("Seen in place"). It carries no information for readers, so it is treated
 * as "no note" everywhere a note is displayed. New sightings simply store no
 * note at all.
 */
export const LEGACY_SIGHTING_NOTE = 'Seen in place';

const LEGACY_NOTE_PATTERN = /^seen\s+in\s+place[\s.!]*$/i;

/** Latitude/longitude pairs that old builds sometimes wrote into `area`. */
const COORDINATE_PATTERN =
  /^-?\d{1,3}(?:\.\d+)?\s*[,;]\s*-?\d{1,3}(?:\.\d+)?(?:\s*[·,].*)?$/;

export function displayNote(note: string | null | undefined): string | null {
  const value = note?.trim();
  if (!value || LEGACY_NOTE_PATTERN.test(value)) return null;
  return value;
}

/**
 * A human place name is useful on a bin card; a raw coordinate pair is not
 * (and the map already shows exactly where the pin is).
 */
export function displayArea(area: string | null | undefined): string | null {
  const value = area?.trim();
  if (!value || value.startsWith('seed') || COORDINATE_PATTERN.test(value)) return null;
  return value;
}
