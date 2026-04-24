import { createClient, RedisClientType } from 'redis';
import { CommandQueue } from './types/command-queue';

/**
 * Redis list-based command queue implementation.
 */
export class RedisQueue implements CommandQueue {
  private readonly client: RedisClientType;

  /**
   * @param redisUrl Redis connection URL.
   * @param queueKey Redis list key used as the queue.
   */
  constructor(
    private readonly redisUrl: string,
    private readonly queueKey: string
  ) {
    this.client = createClient({ url: this.redisUrl });
  }

  /**
   * @returns Promise resolved when Redis client is connected.
   */
  async connect(): Promise<void> {
    if (this.client.isOpen) {
      return;
    }
    await this.client.connect();
  }

  /**
   * @param commandId Command id to enqueue.
   * @returns Promise resolved after enqueue.
   */
  async enqueue(commandId: string): Promise<void> {
    await this.client.rPush(this.queueKey, commandId);
  }

  /**
   * @param timeoutMs Wait timeout in milliseconds.
   * @returns Dequeued command id, or null on timeout.
   */
  async dequeue(timeoutMs: number): Promise<string | null> {
    const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
    const result = await this.client.blPop(this.queueKey, timeoutSeconds);
    return result?.element || null;
  }

  /**
   * @returns Promise resolved after Redis connection is closed.
   */
  async close(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }
}
