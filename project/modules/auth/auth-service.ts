import { createId, nowTs } from '../utils';
import { hashPassword, verifyPassword } from './password-hasher';
import { generateSessionToken, hashSessionToken } from './token-utils';
import { AuthRepo, AuthUserRecord, PublicUser } from './types';

const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface AuthResult {
  user: PublicUser;
  sessionToken: string;
}

export class AuthService {
  constructor(
    private readonly repo: AuthRepo,
    private readonly options: { sessionTtlMs?: number } = {},
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const email = this.normalizeEmail(input.email);
    const name = input.name.trim();
    const password = input.password;
    this.validateRegisterInput(name, email, password);

    const existing = await this.repo.findUserByEmail(email);
    if (existing) {
      throw new Error('Email is already registered.');
    }

    const ts = nowTs();
    const user = await this.repo.createUser({
      id: createId('usr'),
      name,
      email,
      passwordHash: await hashPassword(password),
      createdAt: ts,
      updatedAt: ts,
    });

    const session = await this.createSession(user.id);
    return {
      user: this.toPublicUser(user),
      sessionToken: session.token,
    };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const email = this.normalizeEmail(input.email);
    const password = input.password;
    if (!email || !password) {
      throw new Error('Email and password are required.');
    }

    const user = await this.repo.findUserByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password.');
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new Error('Invalid email or password.');
    }

    const session = await this.createSession(user.id);
    return {
      user: this.toPublicUser(user),
      sessionToken: session.token,
    };
  }

  async getAuthenticatedUser(sessionToken: string): Promise<PublicUser | null> {
    const token = sessionToken.trim();
    if (!token) {
      return null;
    }
    const tokenHash = hashSessionToken(token);
    const session = await this.repo.findSessionByTokenHash(tokenHash);
    if (!session) {
      return null;
    }
    if (session.revokedAt) {
      return null;
    }
    if (session.expiresAt <= nowTs()) {
      await this.repo.revokeSessionByTokenHash(tokenHash, nowTs());
      return null;
    }
    const user = await this.repo.findUserById(session.userId);
    if (!user) {
      return null;
    }
    return this.toPublicUser(user);
  }

  async logout(sessionToken: string): Promise<void> {
    const token = sessionToken.trim();
    if (!token) {
      return;
    }
    await this.repo.revokeSessionByTokenHash(hashSessionToken(token), nowTs());
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private validateRegisterInput(name: string, email: string, password: string): void {
    if (!name || !email || !password) {
      throw new Error('Name, email, and password are required.');
    }
    if (!email.includes('@')) {
      throw new Error('Email is invalid.');
    }
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }
  }

  private async createSession(userId: string): Promise<{ token: string }> {
    const ts = nowTs();
    const ttl = this.options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    const token = generateSessionToken();
    await this.repo.createSession({
      id: createId('usess'),
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: ts + ttl,
      createdAt: ts,
      updatedAt: ts,
    });
    return { token };
  }

  private toPublicUser(user: AuthUserRecord): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

