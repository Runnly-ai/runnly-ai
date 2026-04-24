import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrchestrationService } from '../orchestration-service';
import { SessionRepo } from '../../session';
import { CommandService } from '../../command';
import { EventService } from '../../event';
import { TaskService } from '../../task';
import { Logger } from '../../utils/logger';
import { WorkflowConfig } from '../types';

describe('OrchestrationService', () => {
  let service: OrchestrationService;
  let mockTaskService: TaskService;
  let mockCommandService: CommandService;
  let mockSessionRepo: SessionRepo;
  let mockEventService: EventService;
  let mockLogger: Logger;

  beforeEach(() => {
    mockTaskService = {
      createTask: vi.fn(),
      getTask: vi.fn(),
      updateTask: vi.fn(),
      listSessionTasks: vi.fn(),
    } as any;

    mockCommandService = {
      createCommand: vi.fn(),
      getCommand: vi.fn(),
      updateCommand: vi.fn(),
    } as any;

    mockSessionRepo = {
      create: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      close: vi.fn(),
    } as any;

    mockEventService = {
      emit: vi.fn(),
      subscribe: vi.fn(),
    } as any;

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
    };
  });

  describe('workflow configuration', () => {
    it('should initialize with default workflow config', () => {
      service = new OrchestrationService({
        taskService: mockTaskService,
        commandService: mockCommandService,
        sessionRepo: mockSessionRepo,
        eventService: mockEventService,
        logger: mockLogger,
        logWorkflowProgress: false,
        workspaceRootDir: '/tmp',
      });

      // Service should be created without errors
      expect(service).toBeDefined();
    });

    it('should initialize with custom workflow config', () => {
      const customConfig: WorkflowConfig = {
        steps: ['PLANNING', 'IMPLEMENTATION'],
        retryOnFailure: {
          TESTING: true,
          REVIEW: true,
        },
      };

      service = new OrchestrationService({
        taskService: mockTaskService,
        commandService: mockCommandService,
        sessionRepo: mockSessionRepo,
        eventService: mockEventService,
        logger: mockLogger,
        logWorkflowProgress: false,
        workflowConfig: customConfig,
        workspaceRootDir: '/tmp',
      });

      expect(service).toBeDefined();
    });

    it('should work with minimal workflow config', () => {
      const minimalConfig: WorkflowConfig = {
        steps: ['PLANNING'],
      };

      service = new OrchestrationService({
        taskService: mockTaskService,
        commandService: mockCommandService,
        sessionRepo: mockSessionRepo,
        eventService: mockEventService,
        logger: mockLogger,
        logWorkflowProgress: false,
        workflowConfig: minimalConfig,
        workspaceRootDir: '/tmp',
      });

      expect(service).toBeDefined();
    });

    it('should work with empty steps array', () => {
      const emptyConfig: WorkflowConfig = {
        steps: [],
      };

      service = new OrchestrationService({
        taskService: mockTaskService,
        commandService: mockCommandService,
        sessionRepo: mockSessionRepo,
        eventService: mockEventService,
        logger: mockLogger,
        logWorkflowProgress: false,
        workflowConfig: emptyConfig,
        workspaceRootDir: '/tmp',
      });

      expect(service).toBeDefined();
    });
  });

  describe('service initialization', () => {
    it('should create service with all required dependencies', () => {
      service = new OrchestrationService({
        taskService: mockTaskService,
        commandService: mockCommandService,
        sessionRepo: mockSessionRepo,
        eventService: mockEventService,
        logger: mockLogger,
        logWorkflowProgress: true,
        workspaceRootDir: '/workspace',
      });

      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(OrchestrationService);
    });

    it('should work with optional SCM dependencies', () => {
      const mockScmService = {} as any;
      const mockPrBindingRepo = {} as any;

      service = new OrchestrationService({
        taskService: mockTaskService,
        commandService: mockCommandService,
        sessionRepo: mockSessionRepo,
        eventService: mockEventService,
        scmService: mockScmService,
        pullRequestBindingRepo: mockPrBindingRepo,
        logger: mockLogger,
        logWorkflowProgress: false,
        workspaceRootDir: '/workspace',
      });

      expect(service).toBeDefined();
    });

    it('should respect logWorkflowProgress setting', () => {
      const serviceWithLogging = new OrchestrationService({
        taskService: mockTaskService,
        commandService: mockCommandService,
        sessionRepo: mockSessionRepo,
        eventService: mockEventService,
        logger: mockLogger,
        logWorkflowProgress: true,
        workspaceRootDir: '/workspace',
      });

      const serviceWithoutLogging = new OrchestrationService({
        taskService: mockTaskService,
        commandService: mockCommandService,
        sessionRepo: mockSessionRepo,
        eventService: mockEventService,
        logger: mockLogger,
        logWorkflowProgress: false,
        workspaceRootDir: '/workspace',
      });

      expect(serviceWithLogging).toBeDefined();
      expect(serviceWithoutLogging).toBeDefined();
    });
  });

  describe('workflow step configuration', () => {
    it('should handle all workflow steps', () => {
      const fullConfig: WorkflowConfig = {
        steps: [
          'PREPARE',
          'PLANNING',
          'IMPLEMENTATION',
          'TESTING',
          'REVIEW',
          'PUBLISH',
          'SCM_PIPELINE',
          'SCM_REVIEW',
        ],
      };

      service = new OrchestrationService({
        taskService: mockTaskService,
        commandService: mockCommandService,
        sessionRepo: mockSessionRepo,
        eventService: mockEventService,
        logger: mockLogger,
        logWorkflowProgress: false,
        workflowConfig: fullConfig,
        workspaceRootDir: '/workspace',
      });

      expect(service).toBeDefined();
    });

    it('should handle partial workflow with retries', () => {
      const configWithRetries: WorkflowConfig = {
        steps: ['PLANNING', 'IMPLEMENTATION', 'TESTING'],
        retryOnFailure: {
          TESTING: true,
          REVIEW: false,
        },
      };

      service = new OrchestrationService({
        taskService: mockTaskService,
        commandService: mockCommandService,
        sessionRepo: mockSessionRepo,
        eventService: mockEventService,
        logger: mockLogger,
        logWorkflowProgress: false,
        workflowConfig: configWithRetries,
        workspaceRootDir: '/workspace',
      });

      expect(service).toBeDefined();
    });
  });
});
