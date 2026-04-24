/**
 * Command queue adapter contract.
 */
export interface CommandQueue {
  /**
   * @returns Promise resolved when queue connection is ready.
   */
  connect(): Promise<void>;
  /**
   * @param commandId Command identifier to enqueue.
   * @returns Promise resolved after enqueue completes.
   */
  enqueue(commandId: string): Promise<void>;
  /**
   * @param timeoutMs Wait timeout in milliseconds.
   * @returns Dequeued command id, or null on timeout/no message.
   */
  dequeue(timeoutMs: number): Promise<string | null>;
  /**
   * @returns Promise resolved when resources are closed.
   */
  close(): Promise<void>;
}
