import { applySchemaFile, SqliteDatabaseClient } from '../../db';
import { PullRequestBindingRepo, PullRequestSessionBinding } from './types';
import { ScmProviderType } from '../types/scm';

interface PullRequestBindingRow {
  provider: string;
  repository: string;
  pull_request_number: number;
  session_id: string;
  created_at: number;
  updated_at: number;
}

/**
 * SQLite-backed PR binding repository.
 */
export class SqlitePullRequestBindingRepo implements PullRequestBindingRepo {
  private readonly db: SqliteDatabaseClient;

  constructor(filename: string) {
    this.db = new SqliteDatabaseClient(filename);
  }

  async connect(): Promise<void> {
    await this.db.connect();
    await applySchemaFile(this.db, 'sqlite');
  }

  async upsert(binding: PullRequestSessionBinding): Promise<PullRequestSessionBinding> {
    await this.db.run(
      `
      INSERT INTO scm_pr_bindings (
        provider,
        repository,
        pull_request_number,
        session_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, repository, pull_request_number)
      DO UPDATE SET
        session_id = excluded.session_id,
        updated_at = excluded.updated_at
      `,
      [
        binding.provider,
        binding.repository.toLowerCase(),
        binding.pullRequestNumber,
        binding.sessionId,
        binding.createdAt,
        binding.updatedAt,
      ]
    );
    return binding;
  }

  async find(
    provider: ScmProviderType,
    repository: string,
    pullRequestNumber: number
  ): Promise<PullRequestSessionBinding | null> {
    const rows = await this.db.query<PullRequestBindingRow>(
      `
      SELECT
        provider,
        repository,
        pull_request_number,
        session_id,
        created_at,
        updated_at
      FROM scm_pr_bindings
      WHERE provider = ? AND repository = ? AND pull_request_number = ?
      LIMIT 1
      `,
      [provider, repository.toLowerCase(), pullRequestNumber]
    );

    if (rows.length === 0) {
      return null;
    }

    return this.mapRow(rows[0]);
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  private mapRow(row: PullRequestBindingRow): PullRequestSessionBinding {
    return {
      provider: row.provider as ScmProviderType,
      repository: row.repository,
      pullRequestNumber: row.pull_request_number,
      sessionId: row.session_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
