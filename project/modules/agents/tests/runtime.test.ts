import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRuntime } from '../runtime';
import { CommandQueue } from '../../infra';
import { CommandService } from '../../command';
import { EventService } from '../../event';
import { TaskService } from '../../task';
import { SessionRepo } from '../../session';
import { Workspace } from '../../workspace';
import { Logger } from '../../utils/logger';
import { Command } from '../../command';

describe('AgentRuntime', () => {
  let runtime: AgentRuntime;
  let mockQueue: CommandQueue;
  let mockCommandService: CommandService;
  let mockEventService: EventService;
  let mockTaskService: TaskService;
  let mockSessionRepo: SessionRepo;
  let mockWorkspace: Workspace;
  let mockLogger: Logger;
  let mockResolveAgent: (command: Command) => any;

  beforeEach(() => {
    mockQueue = {
      connect: vi.fn(),
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue(null),
      close: vi.fn(),
    };

    mockCommandService = {
      getById: vi.fn(),
      markRunning: vi.fn(),
      markCompleted: vi.fn(),
      markFailed: vi.fn(),
    } as any;

    mockEventService = {
      emit: vi.fn(),
    } as any;

    mockTaskService = {} as any;
    mockSessionRepo = {
      connect: vi.fn(),
      create: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      close: vi.fn(),
    } as any;
    mockWorkspace = {} as any;

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    mockResolveAgent = vi.fn();

    runtime = new AgentRuntime({
      queue: mockQueue,
      commandService: mockCommandService,
      eventService: mockEventService,
      resolveAgent: mockResolveAgent,
      taskService: mockTaskService,
      sessionRepo: mockSessionRepo,
      workspace: mockWorkspace,
      logger: mockLogger,
      logWorkflowProgress: false,
      logAgentDebug: false,
    });
  });

  describe('initialization', () => {
    it('should create runtime with required dependencies', () => {
      expect(runtime).toBeDefined();
      expect(runtime).toBeInstanceOf(AgentRuntime);
    });

    it('should create runtime with workflow progress logging enabled', () => {
      const runtimeWithLog = new AgentRuntime({
        queue: mockQueue,
        commandService: mockCommandService,
        eventService: mockEventService,
        resolveAgent: mockResolveAgent,
        taskService: mockTaskService,
        sessionRepo: mockSessionRepo,
        workspace: mockWorkspace,
        logger: mockLogger,
        logWorkflowProgress: true,
        logAgentDebug: false,
      });

      expect(runtimeWithLog).toBeDefined();
    });

    it('should create runtime with agent debug logging enabled', () => {
      const runtimeWithDebug = new AgentRuntime({
        queue: mockQueue,
        commandService: mockCommandService,
        eventService: mockEventService,
        resolveAgent: mockResolveAgent,
        taskService: mockTaskService,
        sessionRepo: mockSessionRepo,
        workspace: mockWorkspace,
        logger: mockLogger,
        logWorkflowProgress: false,
        logAgentDebug: true,
      });

      expect(runtimeWithDebug).toBeDefined();
    });
  });

  describe('lifecycle', () => {
    it('should handle stop when not running', async () => {
      await expect(runtime.stop()).resolves.toBeUndefined();
    });
  });
});
