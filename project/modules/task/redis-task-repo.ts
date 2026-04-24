import { createClient, RedisClientType } from 'redis';
import { TaskRepo } from './types/task-repo';
import { Task, TaskTypeType } from './types/task';

/**
 * Redis-backed task repository with session/type indexes.
 */
export class RedisTaskRepo implements TaskRepo {
  private readonly client: RedisClientType;
  private readonly tasksKey: string;
  private readonly keyPrefix: string;

  /**
   * @param redisUrl Redis connection URL.
   * @param keyPrefix Key namespace prefix.
   */
  constructor(
    private readonly redisUrl: string,
    keyPrefix: string
  ) {
    this.client = createClient({ url: this.redisUrl });
    this.keyPrefix = keyPrefix;
    this.tasksKey = `${keyPrefix}:tasks`;
  }

  /**
   * @returns Promise resolved when Redis client is connected.
   */
  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  /**
   * @param task Task record.
   * @returns Stored task.
   */
  async create(task: Task): Promise<Task> {
    await this.client.multi()
      .hSet(this.tasksKey, task.id, JSON.stringify(task))
      .sAdd(`${this.keyPrefix}:tasks:session:${task.sessionId}`, task.id)
      .sAdd(`${this.keyPrefix}:tasks:session:${task.sessionId}:type:${task.type}`, task.id)
      .exec();
    return task;
  }

  /**
   * @param id Task id.
   * @param patch Partial task update.
   * @returns Updated task, or null.
   */
  async update(id: string, patch: Partial<Task>): Promise<Task | null> {
    const current = await this.getById(id);
    if (!current) {
      return null;
    }
    const next = { ...current, ...patch };
    await this.client.hSet(this.tasksKey, id, JSON.stringify(next));
    return next;
  }

  /**
   * @param sessionId Session id.
   * @returns Tasks for this session.
   */
  async listBySessionId(sessionId: string): Promise<Task[]> {
    const ids = await this.client.sMembers(`${this.keyPrefix}:tasks:session:${sessionId}`);
    return this.loadMany(ids);
  }

  /**
   * @param sessionId Session id.
   * @param type Task type filter.
   * @returns Matching tasks.
   */
  async listBySessionAndType(sessionId: string, type: TaskTypeType): Promise<Task[]> {
    const ids = await this.client.sMembers(`${this.keyPrefix}:tasks:session:${sessionId}:type:${type}`);
    return this.loadMany(ids);
  }

  /**
   * @param id Task id.
   * @returns Task record, or null.
   */
  async getById(id: string): Promise<Task | null> {
    const raw = await this.client.hGet(this.tasksKey, id);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as Task;
  }

  /**
   * @param ids Task ids.
   * @returns Loaded tasks sorted by creation timestamp.
   */
  private async loadMany(ids: string[]): Promise<Task[]> {
    if (ids.length === 0) {
      return [];
    }
    const raws = await this.client.hmGet(this.tasksKey, ids);
    const tasks: Task[] = [];
    for (const raw of raws) {
      if (raw) {
        tasks.push(JSON.parse(raw) as Task);
      }
    }
    tasks.sort((a, b) => a.createdAt - b.createdAt);
    return tasks;
  }

  /**
   * @returns Promise resolved when Redis client is closed.
   */
  async close(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }
}
