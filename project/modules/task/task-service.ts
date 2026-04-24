import { createId } from '../utils/id';
import { nowTs } from '../utils/time';
import { Task, TaskStatus, TaskTypeType } from './types/task';
import { TaskRepo } from './types/task-repo';

interface CreateTaskInput {
  sessionId: string;
  type: TaskTypeType;
  title: string;
  input?: Record<string, unknown>;
}

/**
 * Task lifecycle service.
 */
export class TaskService {
  /**
   * @param taskRepo Task repository implementation.
   */
  constructor(private readonly taskRepo: TaskRepo) {}

  /**
   * Creates a new pending task.
   *
   * @param input Task creation payload.
   * @returns Created task.
   */
  async createTask({ sessionId, type, title, input }: CreateTaskInput): Promise<Task> {
    const ts = nowTs();
    return this.taskRepo.create({
      id: createId('task'),
      sessionId,
      type,
      title,
      status: TaskStatus.PENDING,
      input: input || {},
      output: {},
      createdAt: ts,
      updatedAt: ts,
    });
  }

  /**
   * Marks a task as in progress.
   *
   * @param taskId Task identifier.
   * @returns Updated task, or null if not found.
   */
  async markInProgress(taskId: string): Promise<Task | null> {
    return this.taskRepo.update(taskId, {
      status: TaskStatus.IN_PROGRESS,
      updatedAt: nowTs(),
    });
  }

  /**
   * Marks a task as done.
   *
   * @param taskId Task identifier.
   * @param output Optional task output payload.
   * @returns Updated task, or null if not found.
   */
  async markDone(taskId: string, output?: Record<string, unknown>): Promise<Task | null> {
    return this.taskRepo.update(taskId, {
      status: TaskStatus.DONE,
      output: output || {},
      updatedAt: nowTs(),
    });
  }

  /**
   * Marks a task as failed.
   *
   * @param taskId Task identifier.
   * @param output Optional failure payload.
   * @returns Updated task, or null if not found.
   */
  async markFailed(taskId: string, output?: Record<string, unknown>): Promise<Task | null> {
    return this.taskRepo.update(taskId, {
      status: TaskStatus.FAILED,
      output: output || {},
      updatedAt: nowTs(),
    });
  }

  /**
   * Lists tasks for a session.
   *
   * @param sessionId Session identifier.
   * @returns Tasks associated with the session.
   */
  async listBySessionId(sessionId: string): Promise<Task[]> {
    return this.taskRepo.listBySessionId(sessionId);
  }

  /**
   * Lists tasks for a session filtered by type.
   *
   * @param sessionId Session identifier.
   * @param type Task type filter.
   * @returns Matching tasks.
   */
  async listBySessionAndType(sessionId: string, type: TaskTypeType): Promise<Task[]> {
    return this.taskRepo.listBySessionAndType(sessionId, type);
  }

  /**
   * Retrieves a task by id.
   *
   * @param taskId Task identifier.
   * @returns Task record, or null if missing.
   */
  async getById(taskId: string): Promise<Task | null> {
    return this.taskRepo.getById(taskId);
  }
}
