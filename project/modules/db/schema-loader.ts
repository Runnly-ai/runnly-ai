import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseClient } from './types';

export type DbDialect = 'sqlite' | 'postgres';

/**
 * Applies SQL schema file for selected dialect.
 */
export async function applySchemaFile(db: DatabaseClient, dialect: DbDialect): Promise<void> {
  const sql = await loadSchemaText(dialect);
  const statements = sql
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.run(statement);
  }
}

async function loadSchemaText(dialect: DbDialect): Promise<string> {
  const schemaPath = path.join(__dirname, 'schema', `${dialect}.sql`);
  try {
    return await fs.readFile(schemaPath, 'utf8');
  } catch (error) {
    throw new Error(`Schema file not found for dialect ${dialect}: ${schemaPath}. ${String(error)}`);
  }
}
