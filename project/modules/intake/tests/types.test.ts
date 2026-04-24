import { describe, it, expect } from 'vitest';
import { UserIntentAction } from '../types';

describe('Intake Types', () => {
  describe('UserIntentAction', () => {
    it('should have START_SESSION action', () => {
      const action: UserIntentAction = 'START_SESSION';
      expect(action).toBe('START_SESSION');
    });

    it('should have GET_SESSION action', () => {
      const action: UserIntentAction = 'GET_SESSION';
      expect(action).toBe('GET_SESSION');
    });

    it('should have GET_EVENTS action', () => {
      const action: UserIntentAction = 'GET_EVENTS';
      expect(action).toBe('GET_EVENTS');
    });
  });

  describe('StartSessionRequest', () => {
    it('should create valid start session request', () => {
      const request = {
        action: 'START_SESSION' as const,
        rawMessage: 'Build a login page',
        confidence: 0.95,
        goal: 'Create authentication UI',
        autoStart: true,
        context: {
          sessionId: 'sess_1',
          userId: 'user_1',
          projectId: 'proj_1',
        },
      };

      expect(request.action).toBe('START_SESSION');
      expect(request.confidence).toBeGreaterThan(0);
      expect(request.goal).toBeTruthy();
    });
  });

  describe('GetSessionRequest', () => {
    it('should create valid get session request', () => {
      const request = {
        action: 'GET_SESSION' as const,
        rawMessage: 'Show me session status',
        confidence: 0.88,
        sessionId: 'sess_123',
      };

      expect(request.action).toBe('GET_SESSION');
      expect(request.sessionId).toBe('sess_123');
    });
  });

  describe('ConversationalRequest', () => {
    it('should create valid conversational request', () => {
      const request = {
        action: 'CONVERSE' as const,
        rawMessage: 'What can you help me with?',
        confidence: 0.75,
        reply: 'I can help you build features, review code, and manage your project.',
      };

      expect(request.action).toBe('CONVERSE');
      expect(request.reply).toBeTruthy();
    });
  });

  describe('TaskRequestResult', () => {
    it('should create valid task request result', () => {
      const result = {
        kind: 'task' as const,
        request: {
          action: 'START_SESSION' as const,
          rawMessage: 'test',
          confidence: 0.9,
          goal: 'test goal',
          autoStart: false,
          context: {
            sessionId: 'sess_1',
            userId: 'user_1',
            projectId: 'proj_1',
          },
        },
        sessionId: 'sess_1',
        status: 'in_progress',
        currentStep: 'PLAN',
        progress: 25,
        summary: 'Planning phase',
        events: [],
      };

      expect(result.kind).toBe('task');
      expect(result.progress).toBeGreaterThanOrEqual(0);
      expect(result.progress).toBeLessThanOrEqual(100);
    });
  });
});
