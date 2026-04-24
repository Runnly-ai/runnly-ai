export interface AuthUserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
  revokedAt: number | null;
}

export interface CreateUserInput {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateAuthSessionInput {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface AuthRepo {
  connect(): Promise<void>;
  close(): Promise<void>;
  createUser(input: CreateUserInput): Promise<AuthUserRecord>;
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  findUserById(id: string): Promise<AuthUserRecord | null>;
  createSession(input: CreateAuthSessionInput): Promise<AuthSessionRecord>;
  findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null>;
  revokeSessionByTokenHash(tokenHash: string, revokedAt: number): Promise<void>;
}

