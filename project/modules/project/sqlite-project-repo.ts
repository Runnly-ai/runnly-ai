import { SqliteDatabaseClient, applySchemaFile } from '../db';
import { createId } from '../utils/id';
import { Project, CreateProjectInput, UpdateProjectInput } from './types/project';
import { ProjectRepository } from './types/project-repo';

/**
 * SQLite-backed project repository.
 */
export class SqliteProjectRepo implements ProjectRepository {
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

  async create(input: CreateProjectInput): Promise<Project> {
    const now = Date.now();
    const project: Project = {
      id: createId('proj'),
      userId: input.userId,
      name: input.name,
      repoUrl: input.repoUrl,
      description: input.description,
      design: input.design,
      rules: input.rules,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.run(
      `INSERT INTO projects (id, user_id, name, repo_url, description, design, rules, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        project.id,
        project.userId,
        project.name,
        project.repoUrl,
        project.description || null,
        project.design || null,
        project.rules || null,
        project.createdAt,
        project.updatedAt,
      ]
    );

    return project;
  }

  async getById(id: string): Promise<Project | undefined> {
    const rows = await this.db.query('SELECT * FROM projects WHERE id = ?', [id]);
    if (rows.length === 0) {
      return undefined;
    }
    return this.rowToProject(rows[0]);
  }

  async listByUserId(userId: string): Promise<Project[]> {
    const rows = await this.db.query(
      'SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows.map((row) => this.rowToProject(row));
  }

  async update(id: string, input: UpdateProjectInput): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }
    if (input.repoUrl !== undefined) {
      updates.push('repo_url = ?');
      values.push(input.repoUrl);
    }
    if (input.description !== undefined) {
      updates.push('description = ?');
      values.push(input.description || null);
    }
    if (input.design !== undefined) {
      updates.push('design = ?');
      values.push(input.design || null);
    }
    if (input.rules !== undefined) {
      updates.push('rules = ?');
      values.push(input.rules || null);
    }

    if (updates.length === 0) {
      return;
    }

    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    await this.db.run(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`, values);
  }

  async delete(id: string): Promise<void> {
    await this.db.run('DELETE FROM projects WHERE id = ?', [id]);
  }

  async exists(id: string): Promise<boolean> {
    const rows = await this.db.query('SELECT 1 FROM projects WHERE id = ?', [id]);
    return rows.length > 0;
  }

  private rowToProject(row: any): Project {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      repoUrl: row.repo_url,
      description: row.description || undefined,
      design: row.design || undefined,
      rules: row.rules || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
