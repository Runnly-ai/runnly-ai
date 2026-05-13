import { v7 as uuidv7 } from 'uuid';

/**
 * Generates a UUIDv7.
 *
 * The result is time-ordered for better index locality while remaining
 * globally unique enough for application identifiers.
 */
export function createId(_prefix?: string): string {
  return uuidv7();
}
