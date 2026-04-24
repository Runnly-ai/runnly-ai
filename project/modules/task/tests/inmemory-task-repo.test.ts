import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTaskRepo } from '../inmemory-task-repo';
import { Task, TaskStatus, TaskType } from '../types/task';

describe('InMemoryTaskRepo', () => {
  let repo: InMemoryTaskRepo;

  beforeEach(() => {
    repo = new InMemoryTaskRepo();
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      await expect(repo.connect()).resolves.toBeUndefined();
    });
  });

  describe('create', () => {
    it('should create a task', async () => {
      const task: Task = {
        id: 'task_1',
        sessionId: 'sess_1',
        type: TaskType.PLAN,
        status: TaskStatus.PENDING,
        title: 'Test task',
        input: {},
        output: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = await repo.create(task);
      expect(result).toEqual(task);
    });

    it('should store multiple tasks', async () => {
      const task1: Task = {
        id: 'task_1',
        sessionId: 'sess_1',
        type: TaskType.PLAN,
        status: TaskStatus.PENDING,
        title: 'First',
        input: {},
        output: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const task2: Task = {
        id: 'task_2',
        sessionId: 'sess_1',
        type: TaskType.IMPLEMENT,
        status: TaskStatus.PENDING,
        title: 'Second',
        input: {},
        output: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await repo.create(task1);
      await repo.create(task2);

      const result1 = await repo.getById('task_1');
      const result2 = await repo.getById('task_2');

      expect(result1).toEqual(task1);
      expect(result2).toEqual(task2);
    });
  });

  describe('getById', () => {
    it('should return null for non-existent task', async () => {
      const result = await repo.getById('nonexistent');
      expect(result).toBeNull();
    });

    it('should retrieve task by id', async () => {
      const task: Task = {
        id: 'task_1',
        sessionId: 'sess_1',
        type: TaskType.PLAN,
        status: TaskStatus.DONE,
        title: 'Test',
        input: {},
        output: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await repo.create(task);
      const result = await repo.getById('task_1');

      expect(result).toEqual(task);
    });
  });

  describe('update', () => {
    it('should return null for non-existent task', async () => {
      const result = await repo.update('nonexistent', { status: TaskStatus.DONE });
      expect(result).toBeNull();
    });

    it('should update a task', async () => {
      const task: Task = {
        id: 'task_1',
        sessionId: 'sess_1',
        type: TaskType.PLAN,
        status: TaskStatus.PENDING,
        title: 'Original',
        input: {},
        output: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await repo.create(task);
      const updated = await repo.update('task_1', {
        status: TaskStatus.DONE,
        title: 'Updated',
      });

      expect(updated).toMatchObject({
        id: 'task_1',
        status: TaskStatus.DONE,
        title: 'Updated',
      });
    });

    it('should preserve unchanged fields', async () => {
      const task: Task = {
        id: 'task_1',
        sessionId: 'sess_1',
        type: TaskType.IMPLEMENT,
        status: TaskStatus.PENDING,
        title: 'Test',
        input: {},
        output: {},
        createdAt: 12345,
        updatedAt: 12345,
      };

      await repo.create(task);
      const updated = await repo.update('task_1', { status: TaskStatus.IN_PROGRESS });

      expect(updated).toMatchObject({
        type: TaskType.IMPLEMENT,
        sessionId: 'sess_1',
        createdAt: 12345,
      });
    });
  });

  describe('listBySessionId', () => {
    it('should return empty array for non-existent session', async () => {
      const result = await repo.listBySessionId('nonexistent');
      expect(result).toEqual([]);
    });

    it('should return tasks for specific session', async () => {
      const task1: Task = {
        id: 'task_1',
        sessionId: 'sess_1',
        type: TaskType.PLAN,
        status: TaskStatus.PENDING,
        title: 'First',
        input: {},
        output: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const task2: Task = {
        id: 'task_2',
        sessionId: 'sess_2',
        type: TaskType.PLAN,
        status: TaskStatus.PENDING,
        title: 'Second',
        input: {},
        output: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const task3: Task = {
        id: 'task_3',
        sessionId: 'sess_1',
        type: TaskType.IMPLEMENT,
        status: TaskStatus.PENDING,
        title: 'Third',
        input: {},
        output: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await repo.create(task1);
      await repo.create(task2);
      await repo.create(task3);

      const results = await repo.listBySessionId('sess_1');

      expect(results).toHaveLength(2);
      expect(results).toContainEqual(task1);
      expect(results).toContainEqual(task3);
      expect(results).not.toContainEqual(task2);
    });
  });

  describe('listBySessionAndType', () => {
    it('should return empty array when no matching tasks', async () => {
      const result = await repo.listBySessionAndType('sess_1', TaskType.PLAN);
      expect(result).toEqual([]);
    });

    it('should filter tasks by session and type', async () => {
      const task1: Task = {
        id: 'task_1',
        sessionId: 'sess_1',
        type: TaskType.PLAN,
        status: TaskStatus.PENDING,
        title: 'Plan 1',
        input: {},
        output: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const task2: Task = {
        id: 'task_2',
        sessionId: 'sess_1',
        type: TaskType.IMPLEMENT,
        status: TaskStatus.PENDING,
        title: 'Implement',
        input: {},
        output: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const task3: Task = {
        id: 'task_3',
        sessionId: 'sess_1',
        type: TaskType.PLAN,
        status: TaskStatus.DONE,
        title: 'Plan 2',
        input: {},
        output: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const task4: Task = {
        id: 'task_4',
        sessionId: 'sess_2',
        type: TaskType.PLAN,
        status: TaskStatus.PENDING,
        title: 'Other session',
        input: {},
        output: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await repo.create(task1);
      await repo.create(task2);
      await repo.create(task3);
      await repo.create(task4);

      const results = await repo.listBySessionAndType('sess_1', TaskType.PLAN);

      expect(results).toHaveLength(2);
      expect(results).toContainEqual(task1);
      expect(results).toContainEqual(task3);
      expect(results).not.toContainEqual(task2);
      expect(results).not.toContainEqual(task4);
    });
  });

  describe('close', () => {
    it('should close successfully', async () => {
      await expect(repo.close()).resolves.toBeUndefined();
    });
  });
});
