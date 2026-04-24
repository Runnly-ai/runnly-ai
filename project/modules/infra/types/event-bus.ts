import { EventRecord } from "../../event/types/event";


/**
 * Async event handler function type.
 */
export type EventHandler = (event: EventRecord) => Promise<void>;

/**
 * Event bus adapter contract.
 */
export interface EventBus {
  /**
   * @returns Promise resolved when event bus connection is ready.
   */
  connect(): Promise<void>;
  /**
   * @param event Event to publish.
   * @returns Promise resolved after publish completes.
   */
  publish(event: EventRecord): Promise<void>;
  /**
   * @param handler Event consumer callback.
   * @returns Unsubscribe callback.
   */
  subscribe(handler: EventHandler): Promise<() => Promise<void>>;
  /**
   * @returns Promise resolved when bus resources are closed.
   */
  close(): Promise<void>;
}
