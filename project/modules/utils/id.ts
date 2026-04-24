/**
 * Generates a prefixed unique id using timestamp + random suffix.
 *
 * @param prefix Id prefix (e.g. sess, task, cmd).
 * @returns Generated id string.
 */
export function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}
