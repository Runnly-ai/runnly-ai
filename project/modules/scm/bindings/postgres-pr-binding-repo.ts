import { applySchemaFile, PostgresDatabaseClient } from '../../db';
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
 * Postgres-backed PR binding repository.
 */
export class PostgresPullRequestBindingRepo implements PullRequestBindingRepo {
  private readonly db: PostgresDatabaseClient;

  constructor(connectionString: string) {
    this.db = new PostgresDatabaseClient(connectionString);
  }

  async connect(): Promise<void> {
    await this.db.connect();
    await applySchemaFile(this.db, 'postgres');
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
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT(provider, repository, pull_request_number)
      DO UPDATE SET
        session_id = EXCLUDED.session_id,
        updated_at = EXCLUDED.updated_at
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
      WHERE provider = $1 AND repository = $2 AND pull_request_number = $3
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
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }
}
