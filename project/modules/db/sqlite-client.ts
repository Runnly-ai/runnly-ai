import fs from 'node:fs/promises';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { DatabaseClient, DbRunResult } from './types';

/**
 * SQLite-backed database client.
 */
export class SqliteDatabaseClient implements DatabaseClient {
  private db: sqlite3.Database | null = null;

  constructor(private readonly filename: string) {}

  async connect(): Promise<void> {
    if (this.db) {
      return;
    }
    const dir = path.dirname(this.filename);
    await fs.mkdir(dir, { recursive: true });

    this.db = await new Promise<sqlite3.Database>((resolve, reject) => {
      const instance = new sqlite3.Database(this.filename, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(instance);
      });
    });
  }

  async close(): Promise<void> {
    if (!this.db) {
      return;
    }
    const db = this.db;
    this.db = null;
    await new Promise<void>((resolve, reject) => {
      db.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const db = this.requireDb();
    return new Promise<T[]>((resolve, reject) => {
      db.all(sql, params, (error, rows) => {
        if (error) {
          reject(error);
          return;
        }
        resolve((rows || []) as T[]);
      });
    });
  }

  async run(sql: string, params: unknown[] = []): Promise<DbRunResult> {
    const db = this.requireDb();
    return new Promise<DbRunResult>((resolve, reject) => {
      db.run(sql, params, function onRun(error: Error | null) {
        if (error) {
          reject(error);
          return;
        }
        resolve({
          affectedRows: this.changes ?? 0,
        });
      });
    });
  }

  private requireDb(): sqlite3.Database {
    if (!this.db) {
      throw new Error('SQLite client is not connected');
    }
    return this.db;
  }
}
