import { applySchemaFile, PostgresDatabaseClient } from '../db';
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

export class PostgresAuthRepo implements AuthRepo {
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

  async createUser(input: CreateUserInput): Promise<AuthUserRecord> {
    const rows = await this.db.query<UserRow>(
      `
      INSERT INTO app_users (
        id,
        email,
        name,
        password_hash,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, email, name, password_hash, created_at, updated_at
      `,
      [input.id, input.email, input.name, input.passwordHash, input.createdAt, input.updatedAt]
    );
    if (!rows[0]) {
      throw new Error('Failed to create user.');
    }
    return this.mapUser(rows[0]);
  }

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const rows = await this.db.query<UserRow>(
      `
      SELECT id, email, name, password_hash, created_at, updated_at
      FROM app_users
      WHERE email = $1
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
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );
    return rows[0] ? this.mapUser(rows[0]) : null;
  }

  async createSession(input: CreateAuthSessionInput): Promise<AuthSessionRecord> {
    const rows = await this.db.query<SessionRow>(
      `
      INSERT INTO app_user_sessions (
        id,
        user_id,
        token_hash,
        expires_at,
        created_at,
        updated_at,
        revoked_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NULL)
      RETURNING id, user_id, token_hash, expires_at, created_at, updated_at, revoked_at
      `,
      [input.id, input.userId, input.tokenHash, input.expiresAt, input.createdAt, input.updatedAt]
    );
    if (!rows[0]) {
      throw new Error('Failed to create session.');
    }
    return this.mapSession(rows[0]);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null> {
    const rows = await this.db.query<SessionRow>(
      `
      SELECT id, user_id, token_hash, expires_at, created_at, updated_at, revoked_at
      FROM app_user_sessions
      WHERE token_hash = $1
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
      SET revoked_at = $1, updated_at = $2
      WHERE token_hash = $3 AND revoked_at IS NULL
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
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  private mapSession(row: SessionRow): AuthSessionRecord {
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      expiresAt: Number(row.expires_at),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      revokedAt: row.revoked_at !== null ? Number(row.revoked_at) : null,
    };
  }
}

