/**
 * Command execution status values.
 */
export const CommandStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  DONE: 'DONE',
  FAILED: 'FAILED',
} as const;

export type CommandStatusType = (typeof CommandStatus)[keyof typeof CommandStatus];

export type CommandType = 'PLAN' | 'GENERATE' | 'FIX' | 'VERIFY' | 'REVIEW' | 'REACT';


/**
 * Command entity.
 */
export interface Command {
  id: string;
  sessionId: string;
  type: CommandType;
  payload: Record<string, unknown>;
  status: CommandStatusType;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
}
