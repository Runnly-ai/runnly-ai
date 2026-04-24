
import { EventRecord } from './types/event';
import { EventRepo } from './types/event-repo';

/**
 * In-memory event repository.
 */
export class InMemoryEventRepo implements EventRepo {
  private readonly events: EventRecord[] = [];

  /**
   * @returns Promise resolved immediately.
   */
  async connect(): Promise<void> {}

  /**
   * @param event Event record to append.
   * @returns Stored event.
   */
  async append(event: EventRecord): Promise<EventRecord> {
    this.events.push(event);
    return event;
  }

  /**
   * @param sessionId Session id.
   * @returns Session events.
   */
  async listBySessionId(sessionId: string): Promise<EventRecord[]> {
    return this.events.filter((event) => event.sessionId === sessionId);
  }

  /**
   * @returns Promise resolved immediately.
   */
  async close(): Promise<void> {}
}
