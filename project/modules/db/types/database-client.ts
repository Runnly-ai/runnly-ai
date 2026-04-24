export interface DbRunResult {
  affectedRows: number;
}

/**
 * Minimal SQL client contract used by persistence adapters.
 */
export interface DatabaseClient {
  connect(): Promise<void>;
  close(): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<DbRunResult>;
}
