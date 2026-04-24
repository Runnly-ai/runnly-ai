
import { Session } from './types/session';
import { SessionRepo } from './types/session-repo';

/**
 * In-memory session repository.
 */
export class InMemorySessionRepo implements SessionRepo {
  private readonly sessions: Map<string, Session> = new Map();

  /**
   * @returns Promise resolved immediately.
   */
  async connect(): Promise<void> {}

  /**
   * @param session Session record to create.
   * @returns Stored session.
   */
  async create(session: Session): Promise<Session> {
    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * @param id Session id.
   * @returns Session record, or null.
   */
  async getById(id: string): Promise<Session | null> {
    return this.sessions.get(id) || null;
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
    this.sessions.set(id, next);
    return next;
  }

  /**
   * @returns Promise resolved immediately.
   */
  async close(): Promise<void> {}
}
