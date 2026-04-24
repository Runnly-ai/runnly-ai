import { createClient, RedisClientType } from 'redis';
import { EventRepo } from './types/event-repo';
import { EventRecord } from './types/event';

/**
 * Redis-backed event repository using per-session append-only lists.
 */
export class RedisEventRepo implements EventRepo {
  private readonly client: RedisClientType;
  private readonly keyPrefix: string;

  /**
   * @param redisUrl Redis connection URL.
   * @param keyPrefix Key namespace prefix.
   */
  constructor(
    private readonly redisUrl: string,
    keyPrefix: string
  ) {
    this.client = createClient({ url: this.redisUrl });
    this.keyPrefix = keyPrefix;
  }

  /**
   * @returns Promise resolved when Redis client is connected.
   */
  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  /**
   * @param event Event record.
   * @returns Stored event.
   */
  async append(event: EventRecord): Promise<EventRecord> {
    await this.client.rPush(
      `${this.keyPrefix}:events:session:${event.sessionId}`,
      JSON.stringify(event)
    );
    return event;
  }

  /**
   * @param sessionId Session id.
   * @returns Event list for this session.
   */
  async listBySessionId(sessionId: string): Promise<EventRecord[]> {
    const raws = await this.client.lRange(`${this.keyPrefix}:events:session:${sessionId}`, 0, -1);
    const events: EventRecord[] = [];
    for (const raw of raws) {
      try {
        events.push(JSON.parse(raw) as EventRecord);
      } catch {
        continue;
      }
    }
    return events;
  }

  /**
   * @returns Promise resolved when Redis client is closed.
   */
  async close(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }
}
