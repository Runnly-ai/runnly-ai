
import { Task, TaskTypeType } from './types/task';
import { TaskRepo } from './types/task-repo';

/**
 * In-memory task repository.
 */
export class InMemoryTaskRepo implements TaskRepo {
  private tasks: Task[] = [];

  /**
   * @returns Promise resolved immediately.
   */
  async connect(): Promise<void> {}

  /**
   * @param task Task record to create.
   * @returns Stored task.
   */
  async create(task: Task): Promise<Task> {
    this.tasks.push(task);
    return task;
  }

  /**
   * @param id Task id.
   * @param patch Partial task update.
   * @returns Updated task, or null.
   */
  async update(id: string, patch: Partial<Task>): Promise<Task | null> {
    const idx = this.tasks.findIndex((task) => task.id === id);
    if (idx < 0) {
      return null;
    }
    const next = { ...this.tasks[idx], ...patch };
    this.tasks[idx] = next;
    return next;
  }

  /**
   * @param sessionId Session id.
   * @returns Tasks for this session.
   */
  async listBySessionId(sessionId: string): Promise<Task[]> {
    return this.tasks.filter((task) => task.sessionId === sessionId);
  }

  /**
   * @param sessionId Session id.
   * @param type Task type filter.
   * @returns Matching tasks.
   */
  async listBySessionAndType(sessionId: string, type: TaskTypeType): Promise<Task[]> {
    return this.tasks.filter((task) => task.sessionId === sessionId && task.type === type);
  }

  /**
   * @param id Task id.
   * @returns Task record, or null.
   */
  async getById(id: string): Promise<Task | null> {
    return this.tasks.find((task) => task.id === id) || null;
  }

  /**
   * @returns Promise resolved immediately.
   */
  async close(): Promise<void> {}
}
