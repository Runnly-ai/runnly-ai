import { CommandQueue } from './types/command-queue';

type QueueResolver = (value: string | null) => void;

/**
 * In-process command queue for local development/testing.
 */
export class InMemoryQueue implements CommandQueue {
  private readonly items: string[] = [];
  private readonly waitingResolvers: Set<QueueResolver> = new Set();

  /**
   * @returns Promise resolved immediately (no external connection).
   */
  async connect(): Promise<void> {}

  /**
   * @param commandId Command identifier to enqueue.
   * @returns Promise resolved after enqueue or direct handoff to waiter.
   */
  async enqueue(commandId: string): Promise<void> {
    const iterator = this.waitingResolvers.values().next();
    if (!iterator.done) {
      const resolver = iterator.value;
      this.waitingResolvers.delete(resolver);
      resolver(commandId);
      return;
    }
    this.items.push(commandId);
  }

  /**
   * @param timeoutMs Wait timeout in milliseconds.
   * @returns Dequeued command id, or null on timeout.
   */
  async dequeue(timeoutMs: number): Promise<string | null> {
    if (this.items.length > 0) {
      return this.items.shift() || null;
    }

    return new Promise((resolve) => {
      let settled = false;
      const resolver: QueueResolver = (commandId) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve(commandId);
      };

      this.waitingResolvers.add(resolver);
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        this.waitingResolvers.delete(resolver);
        resolve(null);
      }, timeoutMs);
    });
  }

  /**
   * @returns Promise resolved after pending waiters are released.
   */
  async close(): Promise<void> {
    for (const resolver of this.waitingResolvers) {
      resolver(null);
    }
    this.waitingResolvers.clear();
  }
}
