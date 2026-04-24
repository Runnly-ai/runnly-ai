/**
 * Workflow task type values.
 */
export const TaskType = {
  PLAN: 'PLAN',
  IMPLEMENT: 'IMPLEMENT',
  TEST: 'TEST',
  REVIEW: 'REVIEW',
} as const;

/**
 * Task execution status values.
 */
export const TaskStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
  FAILED: 'FAILED',
} as const;


export type TaskTypeType = (typeof TaskType)[keyof typeof TaskType];
export type TaskStatusType = (typeof TaskStatus)[keyof typeof TaskStatus];

/**
 * Task entity.
 */
export interface Task {
  id: string;
  sessionId: string;
  type: TaskTypeType;
  title: string;
  status: TaskStatusType;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}