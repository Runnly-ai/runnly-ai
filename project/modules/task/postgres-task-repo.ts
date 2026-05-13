import { applySchemaFile, PostgresDatabaseClient } from '../db';
import { Task, TaskTypeType } from './types/task';
import { TaskRepo } from './types/task-repo';

export class PostgresTaskRepo implements TaskRepo {
  private readonly db: PostgresDatabaseClient;
  constructor(connectionString: string) { this.db = new PostgresDatabaseClient(connectionString); }
  async connect(): Promise<void> { await this.db.connect(); await applySchemaFile(this.db, 'postgres'); }
  async close(): Promise<void> { await this.db.close(); }
  async create(task: Task): Promise<Task> {
    await this.db.query(`INSERT INTO tasks (id, session_id, type, title, status, input, output, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [task.id, task.sessionId, task.type, task.title, task.status, JSON.stringify(task.input||{}), JSON.stringify(task.output||{}), task.createdAt, task.updatedAt]);
    return task;
  }
  async update(id: string, patch: Partial<Task>): Promise<Task | null> { const current = await this.getById(id); if (!current) return null; const next = { ...current, ...patch }; await this.db.run(`UPDATE tasks SET session_id=$1, type=$2, title=$3, status=$4, input=$5, output=$6, updated_at=$7 WHERE id=$8`, [next.sessionId, next.type, next.title, next.status, JSON.stringify(next.input||{}), JSON.stringify(next.output||{}), next.updatedAt, id]); return next; }
  async listBySessionId(sessionId: string): Promise<Task[]> { return (await this.db.query<any>('SELECT * FROM tasks WHERE session_id = $1 ORDER BY created_at ASC', [sessionId])).map((r)=>this.mapRow(r)); }
  async listBySessionAndType(sessionId: string, type: TaskTypeType): Promise<Task[]> { return (await this.db.query<any>('SELECT * FROM tasks WHERE session_id = $1 AND type = $2 ORDER BY created_at ASC', [sessionId, type])).map((r)=>this.mapRow(r)); }
  async getById(id: string): Promise<Task | null> { const rows = await this.db.query<any>('SELECT * FROM tasks WHERE id = $1 LIMIT 1', [id]); return rows[0] ? this.mapRow(rows[0]) : null; }
  private mapRow(row: any): Task { return { id: row.id, sessionId: row.session_id, type: row.type, title: row.title, status: row.status, input: JSON.parse(row.input||'{}'), output: JSON.parse(row.output||'{}'), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at) }; }
}
