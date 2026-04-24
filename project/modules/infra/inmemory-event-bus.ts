
import { EventRecord } from '../event';
import { EventBus, EventHandler } from './types/event-bus';

/**
 * In-process event bus for local development/testing.
 */
export class InMemoryEventBus implements EventBus {
  private readonly handlers: Set<EventHandler> = new Set();

  /**
   * @returns Promise resolved immediately (no external connection).
   */
  async connect(): Promise<void> {}

  /**
   * @param event Event to broadcast.
   * @returns Promise resolved after all handlers complete.
   */
  async publish(event: EventRecord): Promise<void> {
    for (const handler of this.handlers) {
      await handler(event);
    }
  }

  /**
   * @param handler Event handler callback.
   * @returns Unsubscribe callback.
   */
  async subscribe(handler: EventHandler): Promise<() => Promise<void>> {
    this.handlers.add(handler);
    return async () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * @returns Promise resolved after in-memory subscriptions are cleared.
   */
  async close(): Promise<void> {
    this.handlers.clear();
  }
}
