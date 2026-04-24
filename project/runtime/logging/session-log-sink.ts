import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Writes session-specific logs to individual files.
 * Each session gets its own log file: {rootDir}/{sessionId}.log
 * 
 * Queues writes per file to avoid race conditions when multiple
 * async operations log simultaneously.
 */
export class SessionLogFileSink {
  private readonly pendingWrites = new Map<string, Promise<void>>();

  constructor(private readonly rootDir: string) {}

  /**
   * Appends a log payload to the session's log file.
   * Writes are queued per file to prevent interleaving.
   */
  append(payload: Record<string, unknown>): void {
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
    if (!sessionId) {
      return;
    }
    const safeSessionId = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetPath = path.join(this.rootDir, `${safeSessionId}.log`);
    const line = `${JSON.stringify(payload)}\n`;

    const prev = this.pendingWrites.get(targetPath) || Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        await fs.appendFile(targetPath, line, 'utf8');
      });
    this.pendingWrites.set(targetPath, next);
  }
}
