import { applySchemaFile, SqliteDatabaseClient } from '../db';
import { Task, TaskTypeType } from './types/task';
import { TaskRepo } from './types/task-repo';

export class SqliteTaskRepo implements TaskRepo {
  private readonly db: SqliteDatabaseClient;
  constructor(filename: string) { this.db = new SqliteDatabaseClient(filename); }
  async connect(): Promise<void> { await this.db.connect(); await applySchemaFile(this.db, 'sqlite'); }
  async close(): Promise<void> { await this.db.close(); }
  async create(task: Task): Promise<Task> {
    await this.db.run(`INSERT INTO tasks (id, session_id, type, title, status, input, output, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [task.id, task.sessionId, task.type, task.title, task.status, JSON.stringify(task.input||{}), JSON.stringify(task.output||{}), task.createdAt, task.updatedAt]);
    return task;
  }
  async update(id: string, patch: Partial<Task>): Promise<Task | null> {
    const current = await this.getById(id); if (!current) return null;
    const next = { ...current, ...patch };
    await this.db.run(`UPDATE tasks SET session_id=?, type=?, title=?, status=?, input=?, output=?, updated_at=? WHERE id=?`,
      [next.sessionId, next.type, next.title, next.status, JSON.stringify(next.input||{}), JSON.stringify(next.output||{}), next.updatedAt, id]);
    return next;
  }
  async listBySessionId(sessionId: string): Promise<Task[]> { return (await this.db.query<any>('SELECT * FROM tasks WHERE session_id = ? ORDER BY created_at ASC', [sessionId])).map((r)=>this.mapRow(r)); }
  async listBySessionAndType(sessionId: string, type: TaskTypeType): Promise<Task[]> { return (await this.db.query<any>('SELECT * FROM tasks WHERE session_id = ? AND type = ? ORDER BY created_at ASC', [sessionId, type])).map((r)=>this.mapRow(r)); }
  async getById(id: string): Promise<Task | null> { const rows = await this.db.query<any>('SELECT * FROM tasks WHERE id = ? LIMIT 1', [id]); return rows[0] ? this.mapRow(rows[0]) : null; }
  private mapRow(row: any): Task { return { id: row.id, sessionId: row.session_id, type: row.type, title: row.title, status: row.status, input: JSON.parse(row.input||'{}'), output: JSON.parse(row.output||'{}'), createdAt: row.created_at, updatedAt: row.updated_at }; }
}
