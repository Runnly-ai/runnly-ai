/**
 * Event entity.
 */
export interface EventRecord {
  id: string;
  sessionId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: number;
}