import { applySchemaFile, SqliteDatabaseClient } from '../db';
import { createId } from '../utils/id';
import { Session } from './types/session';
import { SessionRepo } from './types/session-repo';
import { normalizeSessionContext } from './types/context';

export class SqliteSessionRepo implements SessionRepo {
  private readonly db: SqliteDatabaseClient;

  constructor(filename: string) {
    this.db = new SqliteDatabaseClient(filename);
  }

  async connect(): Promise<void> {
    await this.db.connect();
    await applySchemaFile(this.db, 'sqlite');
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  async create(session: Session): Promise<Session> {
    await this.db.run(
      `INSERT INTO sessions (id, user_id, project_id, goal, status, context, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.userId,
        session.projectId,
        session.goal,
        session.status,
        JSON.stringify(session.context || {}),
        session.createdAt,
        session.updatedAt,
      ]
    );
    return session;
  }

  async getById(id: string): Promise<Session | null> {
    const rows = await this.db.query<any>('SELECT * FROM sessions WHERE id = ? LIMIT 1', [id]);
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async listByUserId(userId: string): Promise<Session[]> {
    const rows = await this.db.query<any>('SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    return rows.map((row) => this.mapRow(row));
  }

  async listByProjectId(projectId: string): Promise<Session[]> {
    const rows = await this.db.query<any>('SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC', [projectId]);
    return rows.map((row) => this.mapRow(row));
  }

  async update(id: string, patch: Partial<Session>): Promise<Session | null> {
    const current = await this.getById(id);
    if (!current) {
      return null;
    }
    const next: Session = {
      ...current,
      ...patch,
      context: patch.context ? normalizeSessionContext(patch.context) : current.context,
    };
    await this.db.run(
      `UPDATE sessions
       SET user_id = ?, project_id = ?, goal = ?, status = ?, context = ?, updated_at = ?
       WHERE id = ?`,
      [
        next.userId,
        next.projectId,
        next.goal,
        next.status,
        JSON.stringify(next.context || {}),
        next.updatedAt,
        id,
      ]
    );
    return next;
  }

  private mapRow(row: any): Session {
    return {
      id: row.id,
      userId: row.user_id,
      projectId: row.project_id,
      goal: row.goal,
      status: row.status,
      context: normalizeSessionContext(JSON.parse(row.context || '{}')),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
