import { Task, TaskTypeType } from "./task";


/**
 * Task repository contract.
 */
export interface TaskRepo {
  connect(): Promise<void>;
  create(task: Task): Promise<Task>;
  update(id: string, patch: Partial<Task>): Promise<Task | null>;
  listBySessionId(sessionId: string): Promise<Task[]>;
  listBySessionAndType(sessionId: string, type: TaskTypeType): Promise<Task[]>;
  getById(id: string): Promise<Task | null>;
  close(): Promise<void>;
}