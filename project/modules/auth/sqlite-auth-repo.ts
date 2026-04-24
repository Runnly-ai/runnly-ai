import { applySchemaFile, SqliteDatabaseClient } from '../db';
import { AuthRepo, AuthSessionRecord, AuthUserRecord, CreateAuthSessionInput, CreateUserInput } from './types';

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: number;
  updated_at: number;
}

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  created_at: number;
  updated_at: number;
  revoked_at: number | null;
}

export class SqliteAuthRepo implements AuthRepo {
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

  async createUser(input: CreateUserInput): Promise<AuthUserRecord> {
    await this.db.run(
      `
      INSERT INTO app_users (
        id,
        email,
        name,
        password_hash,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      [input.id, input.email, input.name, input.passwordHash, input.createdAt, input.updatedAt]
    );

    const created = await this.findUserById(input.id);
    if (!created) {
      throw new Error('Failed to create user.');
    }
    return created;
  }

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const rows = await this.db.query<UserRow>(
      `
      SELECT id, email, name, password_hash, created_at, updated_at
      FROM app_users
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );
    return rows[0] ? this.mapUser(rows[0]) : null;
  }

  async findUserById(id: string): Promise<AuthUserRecord | null> {
    const rows = await this.db.query<UserRow>(
      `
      SELECT id, email, name, password_hash, created_at, updated_at
      FROM app_users
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );
    return rows[0] ? this.mapUser(rows[0]) : null;
  }

  async createSession(input: CreateAuthSessionInput): Promise<AuthSessionRecord> {
    await this.db.run(
      `
      INSERT INTO app_user_sessions (
        id,
        user_id,
        token_hash,
        expires_at,
        created_at,
        updated_at,
        revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL)
      `,
      [input.id, input.userId, input.tokenHash, input.expiresAt, input.createdAt, input.updatedAt]
    );

    const created = await this.findSessionByTokenHash(input.tokenHash);
    if (!created) {
      throw new Error('Failed to create session.');
    }
    return created;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null> {
    const rows = await this.db.query<SessionRow>(
      `
      SELECT id, user_id, token_hash, expires_at, created_at, updated_at, revoked_at
      FROM app_user_sessions
      WHERE token_hash = ?
      LIMIT 1
      `,
      [tokenHash]
    );
    return rows[0] ? this.mapSession(rows[0]) : null;
  }

  async revokeSessionByTokenHash(tokenHash: string, revokedAt: number): Promise<void> {
    await this.db.run(
      `
      UPDATE app_user_sessions
      SET revoked_at = ?, updated_at = ?
      WHERE token_hash = ? AND revoked_at IS NULL
      `,
      [revokedAt, revokedAt, tokenHash]
    );
  }

  private mapUser(row: UserRow): AuthUserRecord {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapSession(row: SessionRow): AuthSessionRecord {
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revokedAt: row.revoked_at,
    };
  }
}

