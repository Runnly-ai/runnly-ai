import { createClient, RedisClientType } from 'redis';

import { SessionRepo } from './types/session-repo';
import { Session } from './types/session';

/**
 * Redis-backed session repository.
 */
export class RedisSessionRepo implements SessionRepo {
  private readonly client: RedisClientType;
  private readonly sessionsKey: string;

  /**
   * @param redisUrl Redis connection URL.
   * @param keyPrefix Key namespace prefix.
   */
  constructor(
    private readonly redisUrl: string,
    keyPrefix: string
  ) {
    this.client = createClient({ url: this.redisUrl });
    this.sessionsKey = `${keyPrefix}:sessions`;
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
   * @param session Session record.
   * @returns Stored session.
   */
  async create(session: Session): Promise<Session> {
    await this.client.hSet(this.sessionsKey, session.id, JSON.stringify(session));
    return session;
  }

  /**
   * @param id Session id.
   * @returns Session record, or null.
   */
  async getById(id: string): Promise<Session | null> {
    const raw = await this.client.hGet(this.sessionsKey, id);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as Session;
  }

  /**
   * @param id Session id.
   * @param patch Partial session update.
   * @returns Updated session, or null.
   */
  async update(id: string, patch: Partial<Session>): Promise<Session | null> {
    const current = await this.getById(id);
    if (!current) {
      return null;
    }
    const next = { ...current, ...patch };
    await this.client.hSet(this.sessionsKey, id, JSON.stringify(next));
    return next;
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
