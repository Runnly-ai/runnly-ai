import { CommandQueue } from '../modules/infra';

/**
 * Wrapper around CommandQueue to handle session IDs instead of command IDs.
 * Reuses the existing queue infrastructure for session-based worker pattern.
 */
export class SessionQueue {
  constructor(private readonly queue: CommandQueue) {}

  /**
   * Enqueue a session ID for processing.
   */
  async enqueue(sessionId: string): Promise<void> {
    await this.queue.enqueue(sessionId);
  }

  /**
   * Dequeue a session ID for processing.
   */
  async dequeue(timeoutMs: number): Promise<string | null> {
    return this.queue.dequeue(timeoutMs);
  }
}
