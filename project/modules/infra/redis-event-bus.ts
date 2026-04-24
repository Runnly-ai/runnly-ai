import { createClient, RedisClientType } from 'redis';
import { EventBus, EventHandler } from './types/event-bus';
import { EventRecord } from '../event';

/**
 * Redis pub/sub implementation of EventBus.
 */
export class RedisEventBus implements EventBus {
  private readonly publisher: RedisClientType;
  private readonly subscriber: RedisClientType;
  private readonly handlers: Set<EventHandler> = new Set();
  private subscribed = false;

  /**
   * @param redisUrl Redis connection URL.
   * @param channel Pub/sub channel name.
   */
  constructor(
    private readonly redisUrl: string,
    private readonly channel: string
  ) {
    this.publisher = createClient({ url: this.redisUrl });
    this.subscriber = createClient({ url: this.redisUrl });
  }

  /**
   * @returns Promise resolved when publisher/subscriber clients are connected.
   */
  async connect(): Promise<void> {
    if (!this.publisher.isOpen) {
      await this.publisher.connect();
    }
    if (!this.subscriber.isOpen) {
      await this.subscriber.connect();
    }
  }

  /**
   * @param event Event to publish.
   * @returns Promise resolved after publish completes.
   */
  async publish(event: EventRecord): Promise<void> {
    await this.publisher.publish(this.channel, JSON.stringify(event));
  }

  /**
   * @param handler Event handler callback.
   * @returns Unsubscribe callback for this handler.
   */
  async subscribe(handler: EventHandler): Promise<() => Promise<void>> {
    this.handlers.add(handler);
    if (!this.subscribed) {
      await this.subscriber.subscribe(this.channel, async (message) => {
        let event: EventRecord;
        try {
          event = JSON.parse(message) as EventRecord;
        } catch {
          return;
        }

        for (const activeHandler of this.handlers) {
          await activeHandler(event);
        }
      });
      this.subscribed = true;
    }

    return async () => {
      this.handlers.delete(handler);
      if (this.handlers.size === 0 && this.subscribed) {
        await this.subscriber.unsubscribe(this.channel);
        this.subscribed = false;
      }
    };
  }

  /**
   * @returns Promise resolved after clients are disconnected and subscriptions removed.
   */
  async close(): Promise<void> {
    if (this.subscribed) {
      await this.subscriber.unsubscribe(this.channel);
      this.subscribed = false;
    }
    if (this.subscriber.isOpen) {
      await this.subscriber.quit();
    }
    if (this.publisher.isOpen) {
      await this.publisher.quit();
    }
    this.handlers.clear();
  }
}
