import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCommandRepo } from '../inmemory-command-repo';
import { Command, CommandStatus } from '../types/command';

describe('InMemoryCommandRepo', () => {
  let repo: InMemoryCommandRepo;

  beforeEach(() => {
    repo = new InMemoryCommandRepo();
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      await expect(repo.connect()).resolves.toBeUndefined();
    });
  });

  describe('create', () => {
    it('should create a command', async () => {
      const command: Command = {
        id: 'cmd_1',
        sessionId: 'sess_1',
        type: 'PLAN',
        payload: { task: 'test command' },
        status: CommandStatus.PENDING,
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = await repo.create(command);
      expect(result).toEqual(command);
    });

    it('should store multiple commands', async () => {
      const command1: Command = {
        id: 'cmd_1',
        sessionId: 'sess_1',
        type: 'PLAN',
        payload: { task: 'first' },
        status: CommandStatus.PENDING,
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const command2: Command = {
        id: 'cmd_2',
        sessionId: 'sess_1',
        type: 'GENERATE',
        payload: { task: 'second' },
        status: CommandStatus.PENDING,
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await repo.create(command1);
      await repo.create(command2);

      const result1 = await repo.getById('cmd_1');
      const result2 = await repo.getById('cmd_2');

      expect(result1).toEqual(command1);
      expect(result2).toEqual(command2);
    });
  });

  describe('getById', () => {
    it('should return null for non-existent command', async () => {
      const result = await repo.getById('nonexistent');
      expect(result).toBeNull();
    });

    it('should retrieve command by id', async () => {
      const command: Command = {
        id: 'cmd_1',
        sessionId: 'sess_1',
        type: 'PLAN',
        payload: { task: 'test' },
        status: CommandStatus.PENDING,
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await repo.create(command);
      const result = await repo.getById('cmd_1');

      expect(result).toEqual(command);
    });
  });

  describe('update', () => {
    it('should return null for non-existent command', async () => {
      const result = await repo.update('nonexistent', { status: CommandStatus.RUNNING });
      expect(result).toBeNull();
    });

    it('should update a command', async () => {
      const command: Command = {
        id: 'cmd_1',
        sessionId: 'sess_1',
        type: 'PLAN',
        payload: { task: 'original' },
        status: CommandStatus.PENDING,
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await repo.create(command);
      const updated = await repo.update('cmd_1', { status: CommandStatus.RUNNING });

      expect(updated).toMatchObject({
        id: 'cmd_1',
        status: CommandStatus.RUNNING,
      });
    });

    it('should preserve unchanged fields', async () => {
      const command: Command = {
        id: 'cmd_1',
        sessionId: 'sess_1',
        type: 'PLAN',
        payload: { task: 'original' },
        status: CommandStatus.PENDING,
        retryCount: 0,
        createdAt: 12345,
        updatedAt: 12345,
      };

      await repo.create(command);
      const updated = await repo.update('cmd_1', { status: CommandStatus.RUNNING });

      expect(updated).toMatchObject({
        sessionId: 'sess_1',
        type: 'PLAN',
        createdAt: 12345,
      });
    });
  });

  describe('listBySessionId', () => {
    it('should return empty array for non-existent session', async () => {
      const result = await repo.listBySessionId('nonexistent');
      expect(result).toEqual([]);
    });

    it('should return commands for specific session', async () => {
      const command1: Command = {
        id: 'cmd_1',
        sessionId: 'sess_1',
        type: 'PLAN',
        payload: { task: 'first' },
        status: CommandStatus.PENDING,
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const command2: Command = {
        id: 'cmd_2',
        sessionId: 'sess_2',
        type: 'GENERATE',
        payload: { task: 'second' },
        status: CommandStatus.PENDING,
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const command3: Command = {
        id: 'cmd_3',
        sessionId: 'sess_1',
        type: 'VERIFY',
        payload: { task: 'third' },
        status: CommandStatus.PENDING,
        retryCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await repo.create(command1);
      await repo.create(command2);
      await repo.create(command3);

      const results = await repo.listBySessionId('sess_1');

      expect(results).toHaveLength(2);
      expect(results).toContainEqual(command1);
      expect(results).toContainEqual(command3);
      expect(results).not.toContainEqual(command2);
    });
  });

  describe('close', () => {
    it('should close successfully', async () => {
      await expect(repo.close()).resolves.toBeUndefined();
    });
  });
});
