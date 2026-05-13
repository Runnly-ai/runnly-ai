import { CommandQueue } from '../modules/infra';

export interface SessionQueueItem {
  sessionId: string;
  reason: 'initial' | 'scm-sync' | 'manual';
  triggerEventId?: string;
  createdAt: number;
}

/**
 * Wrapper around CommandQueue to handle structured session work items.
 * Reuses the existing queue infrastructure without changing command queues.
 */
export class SessionQueue {
  constructor(private readonly queue: CommandQueue) {}

  /**
   * Enqueue a structured session work item for processing.
   */
  async enqueue(item: SessionQueueItem): Promise<void> {
    await this.queue.enqueue(JSON.stringify(item));
  }

  /**
   * Dequeue a structured session work item for processing.
   */
  async dequeue(timeoutMs: number): Promise<SessionQueueItem | null> {
    const raw = await this.queue.dequeue(timeoutMs);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<SessionQueueItem>;
      if (
        typeof parsed.sessionId !== 'string' ||
        !parsed.sessionId.trim() ||
        (parsed.reason !== 'initial' && parsed.reason !== 'scm-sync' && parsed.reason !== 'manual')
      ) {
        return { sessionId: raw, reason: 'manual', createdAt: Date.now() };
      }
      return {
        sessionId: parsed.sessionId,
        reason: parsed.reason,
        triggerEventId: typeof parsed.triggerEventId === 'string' ? parsed.triggerEventId : undefined,
        createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
      };
    } catch {
      return { sessionId: raw, reason: 'manual', createdAt: Date.now() };
    }
  }
}
