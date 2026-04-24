import { PostgresDatabaseClient, applySchemaFile } from '../db';
import { createId } from '../utils/id';
import { Project, CreateProjectInput, UpdateProjectInput } from './types/project';
import { ProjectRepository } from './types/project-repo';

/**
 * Postgres-backed project repository.
 */
export class PostgresProjectRepo implements ProjectRepository {
  private readonly db: PostgresDatabaseClient;

  constructor(connectionString: string) {
    this.db = new PostgresDatabaseClient(connectionString);
  }

  async connect(): Promise<void> {
    await this.db.connect();
    await applySchemaFile(this.db, 'postgres');
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

    await this.db.query(
      `INSERT INTO projects (id, user_id, name, repo_url, description, design, rules, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
    const rows = await this.db.query('SELECT * FROM projects WHERE id = $1', [id]);
    if (rows.length === 0) {
      return undefined;
    }
    return this.rowToProject(rows[0]);
  }

  async listByUserId(userId: string): Promise<Project[]> {
    const rows = await this.db.query(
      'SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return rows.map((row) => this.rowToProject(row));
  }

  async update(id: string, input: UpdateProjectInput): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.repoUrl !== undefined) {
      updates.push(`repo_url = $${paramIndex++}`);
      values.push(input.repoUrl);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(input.description || null);
    }
    if (input.design !== undefined) {
      updates.push(`design = $${paramIndex++}`);
      values.push(input.design || null);
    }
    if (input.rules !== undefined) {
      updates.push(`rules = $${paramIndex++}`);
      values.push(input.rules || null);
    }

    if (updates.length === 0) {
      return;
    }

    updates.push(`updated_at = $${paramIndex++}`);
    values.push(Date.now());
    values.push(id);

    await this.db.query(`UPDATE projects SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM projects WHERE id = $1', [id]);
  }

  async exists(id: string): Promise<boolean> {
    const rows = await this.db.query('SELECT 1 FROM projects WHERE id = $1', [id]);
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
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }
}
