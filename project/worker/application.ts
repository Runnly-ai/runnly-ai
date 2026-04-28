import { AppConfig } from '../config/app-config';
import { CommandService } from '../modules/command';
import { EventService } from '../modules/event';
import { OrchestrationService } from '../modules/orchestration/orchestration-service';
import { AzureDevOpsScmProvider, GitHubScmProvider, ScmProvider, ScmProviderType, ScmService } from '../modules/scm';
import { TaskService } from '../modules/task';
import { LocalWorkspace } from '../modules/workspace';
import { workflowConfig } from '../config/workflow-config';
import { closeRuntimeStorage, connectRuntimeStorage, createBaseLogger } from '../runtime/bootstrap';
import { SessionQueue } from './session-queue';
import { Logger } from '../modules/utils/logger';
import { Command, CommandType } from '../modules/command';
import { Agent, PlanningRoleAgent, GenerateRoleAgent, VerifyRoleAgent, ReviewRoleAgent, ReActRoleAgent } from '../modules/agents';
import { createAgentProviderRouter, createPlanningProviderRouter } from '../runtime/factories/agent-factories';

/**
 * Autonomous worker that handles complete session lifecycles.
 * 
 * Each worker:
 * - Pulls a session ID from the queue
 * - Runs orchestration logic for that session
 * - Executes agents inline (no command queue)
 * - Completes the full workflow in one process
 */
export async function createWorkerApplication(config: AppConfig) {
  const { logger, setEmitLogEvent } = await createBaseLogger(config);
  const storage = await connectRuntimeStorage(config);

  const taskService = new TaskService(storage.repos.taskRepo);
  const eventService = new EventService(storage.repos.eventRepo, storage.eventBus);
  setEmitLogEvent((payload) => {
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
    if (!sessionId) {
      return;
    }
    void eventService.emit({ sessionId, type: 'LOG_EMITTED', payload });
  });

  // Create workspace
  const workspace = new LocalWorkspace({ rootDir: config.workspaceRootDir });

  // Create command service (still used for tracking, but not for queue)
  const commandService = new CommandService(storage.repos.commandRepo, storage.queue);

  // Create SCM service
  const scmProviders = new Map<ScmProviderType, ScmProvider>([
    ['github', new GitHubScmProvider()],
    ['azure-devops', new AzureDevOpsScmProvider()],
  ]);
  const scmService = new ScmService(scmProviders, {
    gitPath: config.scmGitPath,
    defaultBaseBranch: config.scmDefaultBaseBranch,
    gitUserName: config.scmGitUserName,
    gitUserEmail: config.scmGitUserEmail,
    rootDir: config.scmRootDir,
    githubToken: config.scmGithubToken,
    azureDevOpsToken: config.scmAzureDevOpsToken,
    logger,
    logProgress: config.logWorkflowProgress || config.logAgentDebug,
  });

  // Create orchestration service
  const orchestrationService = new OrchestrationService({
    taskService,
    commandService,
    sessionRepo: storage.repos.sessionRepo,
    eventService,
    scmService,
    pullRequestBindingRepo: storage.pullRequestBindingRepo,
    logger,
    logWorkflowProgress: config.logWorkflowProgress,
    workflowConfig,
    workspaceRootDir: config.workspaceRootDir,
  });

  // Create session queue (reusing command queue for session IDs)
  const sessionQueue = new SessionQueue(storage.queue);

  // Worker loop state
  let running = false;
  let loopPromise: Promise<void> | null = null;

  const startWorker = ({ pollMs }: { pollMs: number }) => {
    if (running) {
      return;
    }
    running = true;
    logger.info('autonomous worker started', { pollMs });
    loopPromise = runWorkerLoop(
      pollMs,
      sessionQueue,
      orchestrationService,
      eventService,
      commandService,
      taskService,
      workspace,
      logger,
      config,
      () => running
    );
  };

  const stopWorker = async () => {
    if (!running) {
      return;
    }
    running = false;
    logger.info('autonomous worker stopping');
    if (loopPromise) {
      await loopPromise;
      loopPromise = null;
    }
    logger.info('autonomous worker stopped');
  };

  startWorker({ pollMs: config.workerPollMs });

  return {
    logger,
    workspace,
    services: {
      eventService,
      commandService,
      taskService,
      orchestrationService,
    },
    async stop(): Promise<void> {
      await stopWorker();
      await closeRuntimeStorage(storage);
    },
  };
}

/**
 * Main worker loop: pulls session IDs and processes complete lifecycles.
 */
async function runWorkerLoop(
  pollMs: number,
  sessionQueue: SessionQueue,
  orchestrationService: OrchestrationService,
  eventService: EventService,
  commandService: CommandService,
  taskService: TaskService,
  workspace: LocalWorkspace,
  logger: Logger,
  config: AppConfig,
  isRunning: () => boolean
): Promise<void> {
  while (isRunning()) {
    try {
      const sessionId = await sessionQueue.dequeue(pollMs);
      if (!sessionId) {
        continue; // Timeout, loop again
      }

      // Validate that we got a session ID, not a command ID (from old queue entries)
      if (!sessionId.startsWith('sess_')) {
        logger.info('worker dequeued invalid session ID (ignoring old queue entry)', { 
          dequeuedValue: sessionId 
        });
        continue;
      }

      logger.info('worker processing session', { sessionId });
      await processSession(
        sessionId,
        orchestrationService,
        eventService,
        commandService,
        taskService,
        workspace,
        logger,
        config,
        isRunning
      );
      logger.info('worker completed session', { sessionId });
    } catch (err: unknown) {
      logger.error('worker loop iteration failed', err);
    }
  }
}

/**
 * Process a complete session lifecycle in this worker.
 */
async function processSession(
  sessionId: string,
  orchestrationService: OrchestrationService,
  eventService: EventService,
  commandService: CommandService,
  taskService: TaskService,
  workspace: LocalWorkspace,
  logger: Logger,
  config: AppConfig,
  isRunning: () => boolean
): Promise<void> {
  let sessionCompleted = false;
  
  // Subscribe to events for this session and handle them with orchestration
  const unsubscribe = await eventService.subscribe(async (event) => {
    if (event.sessionId !== sessionId) {
      return; // Ignore events for other sessions
    }

    // Handle orchestration transitions
    await orchestrationService.handleEvent(event);
    
    // Check if session is complete
    if (event.type === 'SESSION_COMPLETED' || event.type === 'SESSION_FAILED') {
      sessionCompleted = true;
      logger.info('session lifecycle completed', { sessionId, finalEvent: event.type });
      return;
    }
    
    // Check if worker is shutting down before executing commands
    if (!isRunning()) {
      logger.info('worker shutting down, skipping command execution', { sessionId });
      return;
    }
    
    // After orchestration handles the event, execute any pending commands inline
    await executeSessionCommands(
      sessionId,
      commandService,
      eventService,
      taskService,
      workspace,
      logger,
      config
    );
  });

  try {
    // Check if session has already started and trigger initial orchestration
    // (handles race condition where SESSION_STARTED was emitted before we subscribed)
    const events = await eventService.listBySessionId(sessionId);
    const hasStarted = events.some(e => e.type === 'SESSION_STARTED');
    const alreadyCompleted = events.some(e => e.type === 'SESSION_COMPLETED' || e.type === 'SESSION_FAILED');
    
    if (alreadyCompleted) {
      logger.info('session already completed, skipping', { sessionId });
      return;
    }
    
    if (hasStarted) {
      logger.info('session already started, replaying SESSION_STARTED event', { sessionId });
      const sessionStartedEvent = events.find(e => e.type === 'SESSION_STARTED');
      if (sessionStartedEvent) {
        await orchestrationService.handleEvent(sessionStartedEvent);
        await executeSessionCommands(
          sessionId,
          commandService,
          eventService,
          taskService,
          workspace,
          logger,
          config
        );
      }
    }
    
    // Wait for session to complete (with timeout)
    const maxWaitMs = 30 * 60 * 1000; // 30 minutes max
    const startTime = Date.now();
    
    while (!sessionCompleted && isRunning()) {
      if (Date.now() - startTime > maxWaitMs) {
        logger.error('session processing timeout', { sessionId });
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000)); // Poll every second
    }
    
    if (!isRunning() && !sessionCompleted) {
      logger.info('worker shutting down, session may be incomplete', { sessionId });
    }
  } finally {
    await unsubscribe();
  }
}

/**
 * Execute all pending commands for a session inline (no queue polling).
 */
async function executeSessionCommands(
  sessionId: string,
  commandService: CommandService,
  eventService: EventService,
  taskService: TaskService,
  workspace: LocalWorkspace,
  logger: Logger,
  config: AppConfig
): Promise<void> {
  // Get pending commands for this session (not RUNNING, not DONE, not FAILED)
  const commands = await commandService.listBySessionId(sessionId);
  const pending = commands.filter(cmd => cmd.status === 'PENDING');

  if (pending.length === 0) {
    return; // No work to do
  }

  for (const command of pending) {
    // Atomically claim the command by marking it RUNNING before executing
    // This prevents race conditions where multiple event handlers try to execute the same command
    const claimed = await commandService.markRunning(command.id);
    
    if (!claimed || claimed.status !== 'RUNNING') {
      // Command was already claimed by another handler or doesn't exist
      logger.info('command already claimed or not found, skipping', {
        commandId: command.id,
        claimed: !!claimed,
      });
      continue;
    }

    logger.info('executing command', {
      commandId: command.id,
      commandType: command.type,
      sessionId,
    });

    await executeCommand(
      command,
      commandService,
      eventService,
      taskService,
      workspace,
      logger,
      config
    );
  }
}

/**
 * Execute a single command inline.
 * NOTE: Command should already be marked as RUNNING before calling this.
 */
async function executeCommand(
  command: Command,
  commandService: CommandService,
  eventService: EventService,
  taskService: TaskService,
  workspace: LocalWorkspace,
  logger: Logger,
  config: AppConfig
): Promise<void> {
  const agent = createAgentForCommand(command, config, logger);
  if (!agent) {
    await commandService.markFailed(command.id);
    await eventService.emit({
      sessionId: command.sessionId,
      type: 'COMMAND_FAILED',
      payload: { commandId: command.id, reason: 'No agent capability mapping' },
    });
    logger.info('command failed: no mapped agent', {
      commandId: command.id,
      commandType: command.type,
    });
    return;
  }

  try {
    // Command is already marked as RUNNING by executeSessionCommands
    await agent.execute(command, {
      taskService,
      eventService,
      workspace,
      logger,
      agentDebugLogging: config.logAgentDebug,
    });
    await commandService.markDone(command.id);
    logger.info('command completed', {
      commandId: command.id,
      commandType: command.type,
    });
  } catch (error: unknown) {
    await commandService.markFailed(command.id);
    await eventService.emit({
      sessionId: command.sessionId,
      type: 'COMMAND_FAILED',
      payload: { commandId: command.id, reason: String(error) },
    });
    logger.error('command execution failed', {
      commandId: command.id,
      commandType: command.type,
      error,
    });
  }
}

/**
 * Create agent for command type (similar to agent-factories.ts pattern).
 */
function createAgentForCommand(command: Command, config: AppConfig, logger: Logger): Agent | null {
  const type = command.type;

  if (type === 'PLAN') {
    const planningProviderRouter = createPlanningProviderRouter(config, logger);
    return new PlanningRoleAgent(planningProviderRouter, {
      defaultProvider: config.agentProviderPlan,
      defaultModel: config.agentModelPlan || config.agentModelDefault,
      defaultCwd: config.coderDefaultCwd,
      maxIterations: config.agentMaxIterations,
    });
  }

  if (type === 'GENERATE' || type === 'FIX') {
    const providerRouter = createAgentProviderRouter(config, logger);
    return new GenerateRoleAgent(providerRouter, {
      defaultProvider: config.agentProviderGenerate,
      defaultModel: config.agentModelGenerate || config.agentModelDefault || config.codexModel || config.copilotModel,
      defaultCwd: config.coderDefaultCwd,
      maxIterations: config.agentMaxIterations,
    });
  }

  if (type === 'VERIFY') {
    const providerRouter = createAgentProviderRouter(config, logger);
    return new VerifyRoleAgent(providerRouter, {
      defaultProvider: config.agentProviderVerify,
      defaultModel: config.agentModelVerify || config.agentModelDefault,
      defaultCwd: config.coderDefaultCwd,
      maxIterations: config.agentMaxIterations,
    });
  }

  if (type === 'REVIEW') {
    const providerRouter = createAgentProviderRouter(config, logger);
    return new ReviewRoleAgent(providerRouter, {
      defaultProvider: config.agentProviderReview,
      defaultModel: config.agentModelReview || config.agentModelDefault,
      defaultCwd: config.coderDefaultCwd,
      maxIterations: config.agentMaxIterations,
    });
  }

  if (type === 'REACT') {
    const providerRouter = createAgentProviderRouter(config, logger);
    return new ReActRoleAgent(providerRouter, {
      defaultProvider: config.agentProviderDefault || config.agentProviderGenerate,
      defaultModel: config.agentModelDefault,
      defaultCwd: config.coderDefaultCwd,
      maxIterations: config.agentMaxIterations || 10,
    });
  }

  return null;
}
