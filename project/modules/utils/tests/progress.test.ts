import { describe, it, expect } from 'vitest';
import { getCurrentStep, getProgress, STEP_ORDER } from '../progress';
import { Task, TaskStatus, TaskType } from '../../task/types/task';

describe('progress utils', () => {
  describe('getCurrentStep', () => {
    it('should return first step when no tasks exist', () => {
      const tasks: Task[] = [];
      expect(getCurrentStep(tasks)).toBe(TaskType.PLAN);
    });

    it('should return current step when tasks are in progress', () => {
      const tasks: Task[] = [
        {
          id: 'task_1',
          sessionId: 'sess_1',
          type: TaskType.PLAN,
          title: 'Plan task',
          status: TaskStatus.DONE,
          input: {},
          output: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'task_2',
          sessionId: 'sess_1',
          type: TaskType.IMPLEMENT,
          title: 'Implement task',
          status: TaskStatus.IN_PROGRESS,
          input: {},
          output: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      expect(getCurrentStep(tasks)).toBe(TaskType.IMPLEMENT);
    });

    it('should return COMPLETED when all steps are done', () => {
      const tasks: Task[] = STEP_ORDER.map((type, idx) => ({
        id: `task_${idx}`,
        sessionId: 'sess_1',
        type,
        title: `${type} task`,
        status: TaskStatus.DONE,
        input: {},
        output: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
      expect(getCurrentStep(tasks)).toBe('COMPLETED');
    });

    it('should handle multiple tasks of same type', () => {
      const tasks: Task[] = [
        {
          id: 'task_1',
          sessionId: 'sess_1',
          type: TaskType.PLAN,
          title: 'Plan 1',
          status: TaskStatus.DONE,
          input: {},
          output: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'task_2',
          sessionId: 'sess_1',
          type: TaskType.PLAN,
          title: 'Plan 2',
          status: TaskStatus.DONE,
          input: {},
          output: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'task_3',
          sessionId: 'sess_1',
          type: TaskType.IMPLEMENT,
          title: 'Implement',
          status: TaskStatus.PENDING,
          input: {},
          output: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      expect(getCurrentStep(tasks)).toBe(TaskType.IMPLEMENT);
    });
  });

  describe('getProgress', () => {
    it('should return 0 for empty task list', () => {
      expect(getProgress([])).toBe(0);
    });

    it('should return 0 when no tasks are done', () => {
      const tasks: Task[] = [
        {
          id: 'task_1',
          sessionId: 'sess_1',
          type: TaskType.PLAN,
          title: 'Plan',
          status: TaskStatus.PENDING,
          input: {},
          output: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      expect(getProgress(tasks)).toBe(0);
    });

    it('should return 100 when all tasks are done', () => {
      const tasks: Task[] = [
        {
          id: 'task_1',
          sessionId: 'sess_1',
          type: TaskType.PLAN,
          title: 'Plan',
          status: TaskStatus.DONE,
          input: {},
          output: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'task_2',
          sessionId: 'sess_1',
          type: TaskType.IMPLEMENT,
          title: 'Implement',
          status: TaskStatus.DONE,
          input: {},
          output: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      expect(getProgress(tasks)).toBe(100);
    });

    it('should return 50 when half of tasks are done', () => {
      const tasks: Task[] = [
        {
          id: 'task_1',
          sessionId: 'sess_1',
          type: TaskType.PLAN,
          title: 'Plan',
          status: TaskStatus.DONE,
          input: {},
          output: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'task_2',
          sessionId: 'sess_1',
          type: TaskType.IMPLEMENT,
          title: 'Implement',
          status: TaskStatus.IN_PROGRESS,
          input: {},
          output: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      expect(getProgress(tasks)).toBe(50);
    });

    it('should round progress percentage', () => {
      const tasks: Task[] = [
        {
          id: 'task_1',
          sessionId: 'sess_1',
          type: TaskType.PLAN,
          title: 'Plan',
          status: TaskStatus.DONE,
          input: {},
          output: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'task_2',
          sessionId: 'sess_1',
          type: TaskType.IMPLEMENT,
          title: 'Implement 1',
          status: TaskStatus.PENDING,
          input: {},
          output: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'task_3',
          sessionId: 'sess_1',
          type: TaskType.TEST,
          title: 'Test',
          status: TaskStatus.PENDING,
          input: {},
          output: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      expect(getProgress(tasks)).toBe(33); // 1/3 = 33.33... rounded to 33
    });
  });
});
