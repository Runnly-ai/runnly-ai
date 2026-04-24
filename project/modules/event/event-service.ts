import { EventRepo } from './types/event-repo';
import { EventBus, EventHandler } from '../infra';
import { createId, nowTs } from '../utils';
import { EventRecord } from './types/event';

interface EmitInput {
  sessionId: string;
  type: string;
  payload?: Record<string, unknown>;
}

/**
 * Event emission and subscription service.
 */
export class EventService {
  /**
   * @param eventRepo Event persistence repository.
   * @param eventBus Event bus adapter.
   */
  constructor(
    private readonly eventRepo: EventRepo,
    private readonly eventBus: EventBus
  ) {}

  /**
   * Persists and publishes an event.
   *
   * @param input Event payload.
   * @returns Created event record.
   */
  async emit({ sessionId, type, payload }: EmitInput): Promise<EventRecord> {
    const event: EventRecord = {
      id: createId('evt'),
      sessionId,
      type,
      payload: payload || {},
      createdAt: nowTs(),
    };

    await this.eventRepo.append(event);
    await this.eventBus.publish(event);
    return event;
  }

  /**
   * Registers an event handler.
   *
   * @param handler Async event handler.
   * @returns Unsubscribe callback.
   */
  subscribe(handler: EventHandler): Promise<() => Promise<void>> {
    return this.eventBus.subscribe(handler);
  }

  /**
   * Lists events by session id.
   *
   * @param sessionId Session identifier.
   * @returns Events for this session.
   */
  async listBySessionId(sessionId: string): Promise<EventRecord[]> {
    return this.eventRepo.listBySessionId(sessionId);
  }
}
