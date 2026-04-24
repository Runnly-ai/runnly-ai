import { Pool } from 'pg';
import { DatabaseClient, DbRunResult } from './types';

/**
 * Postgres-backed database client.
 */
export class PostgresDatabaseClient implements DatabaseClient {
  private pool: Pool | null = null;

  constructor(private readonly connectionString: string) {}

  async connect(): Promise<void> {
    if (this.pool) {
      return;
    }
    this.pool = new Pool({
      connectionString: this.connectionString,
    });
    await this.pool.query('SELECT 1');
  }

  async close(): Promise<void> {
    if (!this.pool) {
      return;
    }
    const pool = this.pool;
    this.pool = null;
    await pool.end();
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.requirePool().query(sql, params);
    return result.rows as T[];
  }

  async run(sql: string, params: unknown[] = []): Promise<DbRunResult> {
    const result = await this.requirePool().query(sql, params);
    return {
      affectedRows: result.rowCount || 0,
    };
  }

  private requirePool(): Pool {
    if (!this.pool) {
      throw new Error('Postgres client is not connected');
    }
    return this.pool;
  }
}
