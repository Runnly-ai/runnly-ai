import { SessionContext } from './context';

/**
 * Session lifecycle status values.
 */
export const SessionStatus = {
  CREATED: 'CREATED',
  RUNNING: 'RUNNING',
  FAILED: 'FAILED',
  COMPLETED: 'COMPLETED',
} as const;

export type SessionStatusType = (typeof SessionStatus)[keyof typeof SessionStatus];

/**
 * Session entity.
 */
export interface Session {
  id: string;
  goal: string;
  status: SessionStatusType;
  context: SessionContext;
  createdAt: number;
  updatedAt: number;
}

