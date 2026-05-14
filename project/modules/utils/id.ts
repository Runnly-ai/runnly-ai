import { v7 as uuidv7 } from 'uuid';

let counter = 0;

/**
 * Generates an ID.
 *
 * When a prefix is provided, returns a human-readable ID in the format
 * `{prefix}_{timestamp}_{random8chars}`. Otherwise returns a UUIDv7.
 *
 * The result is time-ordered for better index locality while remaining
 * globally unique enough for application identifiers.
 */
export function createId(prefix?: string): string {
  if (prefix) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${timestamp}_${random}`;
  }
  return uuidv7();
}
