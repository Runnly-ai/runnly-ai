import { describe, it, expect, beforeEach } from 'vitest';
import { InMemorySessionRepo } from '../inmemory-session-repo';
import { Session, SessionStatus } from '../types/session';

describe('InMemorySessionRepo', () => {
  let repo: InMemorySessionRepo;

  beforeEach(() => {
    repo = new InMemorySessionRepo();
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      await expect(repo.connect()).resolves.toBeUndefined();
    });
  });

  describe('create', () => {
    it('should create a session', async () => {
      const session: Session = {
        id: 'sess_1',
        goal: 'Test Session',
        status: SessionStatus.CREATED,
        context: { projectId: 'proj_1' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = await repo.create(session);
      expect(result).toEqual(session);
    });

    it('should store multiple sessions', async () => {
      const session1: Session = {
        id: 'sess_1',
        goal: 'First session',
        status: SessionStatus.CREATED,
        context: { projectId: 'proj_1' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const session2: Session = {
        id: 'sess_2',
        goal: 'Second session',
        status: SessionStatus.CREATED,
        context: { userId: 'user_2', projectId: 'proj_2' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await repo.create(session1);
      await repo.create(session2);

      const result1 = await repo.getById('sess_1');
      const result2 = await repo.getById('sess_2');

      expect(result1).toEqual(session1);
      expect(result2).toEqual(session2);
    });

    it('should overwrite session with same id', async () => {
      const session1: Session = {
        id: 'sess_1',
        goal: 'Original',
        status: SessionStatus.CREATED,
        context: { userId: 'user_1', projectId: 'proj_1' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const session2: Session = {
        id: 'sess_1',
        goal: 'Updated',
        status: SessionStatus.RUNNING,
        context: { userId: 'user_1', projectId: 'proj_1' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await repo.create(session1);
      await repo.create(session2);

      const result = await repo.getById('sess_1');
      expect(result).toEqual(session2);
    });
  });

  describe('getById', () => {
    it('should return null for non-existent session', async () => {
      const result = await repo.getById('nonexistent');
      expect(result).toBeNull();
    });

    it('should retrieve session by id', async () => {
      const session: Session = {
        id: 'sess_1',
        goal: 'Test Goal',
        status: SessionStatus.CREATED,
        context: { userId: 'user_1', projectId: 'proj_1' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await repo.create(session);
      const result = await repo.getById('sess_1');

      expect(result).toEqual(session);
    });
  });

  describe('update', () => {
    it('should return null for non-existent session', async () => {
      const result = await repo.update('nonexistent', { status: SessionStatus.RUNNING });
      expect(result).toBeNull();
    });

    it('should update a session', async () => {
      const session: Session = {
        id: 'sess_1',
        goal: 'Original Goal',
        status: SessionStatus.CREATED,
        context: { userId: 'user_1', projectId: 'proj_1' },
        createdAt: 12345,
        updatedAt: 12345,
      };

      await repo.create(session);
      const updated = await repo.update('sess_1', {
        status: SessionStatus.RUNNING,
        updatedAt: 99999,
      });

      expect(updated).toMatchObject({
        id: 'sess_1',
        status: SessionStatus.RUNNING,
        updatedAt: 99999,
      });
    });

    it('should preserve unchanged fields', async () => {
      const session: Session = {
        id: 'sess_1',
        goal: 'Test Goal',
        status: SessionStatus.CREATED,
        context: { userId: 'user_1', projectId: 'proj_1' },
        createdAt: 12345,
        updatedAt: 12345,
      };

      await repo.create(session);
      const updated = await repo.update('sess_1', { status: SessionStatus.RUNNING });

      expect(updated).toMatchObject({
        goal: 'Test Goal',
        context: { userId: 'user_1', projectId: 'proj_1' },
        createdAt: 12345,
      });
    });

    it('should handle partial updates', async () => {
      const session: Session = {
        id: 'sess_1',
        goal: 'Original',
        status: SessionStatus.CREATED,
        context: { userId: 'user_1' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await repo.create(session);
      const updated = await repo.update('sess_1', { status: SessionStatus.RUNNING });

      expect(updated?.status).toBe(SessionStatus.RUNNING);
      expect(updated?.context).toEqual({ userId: 'user_1' });
    });
  });

  describe('close', () => {
    it('should close successfully', async () => {
      await expect(repo.close()).resolves.toBeUndefined();
    });
  });
});
