import { EventRecord } from "./event";


/**
 * Event repository contract.
 */
export interface EventRepo {
  connect(): Promise<void>;
  append(event: EventRecord): Promise<EventRecord>;
  listBySessionId(sessionId: string): Promise<EventRecord[]>;
  close(): Promise<void>;
}