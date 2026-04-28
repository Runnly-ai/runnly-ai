import { AgentRuntime } from '../modules/agents';
import { AppConfig } from '../config/app-config';
import { CommandService } from '../modules/command';
import { EventService } from '../modules/event';
import { OrchestrationService } from '../modules/orchestration/orchestration-service';
import { SessionService } from '../modules/session';
import { TaskService } from '../modules/task';
import { LocalWorkspace } from '../modules/workspace';
import { UserIntakeService } from '../modules/intake';
import { AzureDevOpsScmProvider, GitHubScmProvider, ScmProvider, ScmProviderType, ScmService, ScmWebhookService } from '../modules/scm';
import { AuthService } from '../modules/auth';
import { createLoggerWithOptions, Logger } from '../modules/utils/logger';
import fs from 'node:fs/promises';
import { workflowConfig } from '../config/workflow-config';
import { intakeValidationSchema } from '../config/intake-validation-schema';
import { createQueue, createEventBus, createRepos, createPullRequestBindingRepo, createAuthRepo } from './factories/storage-factories';
import { createUserIntakeService, createAgentRuntime } from './factories/agent-factories';
import { SessionLogFileSink } from './logging/session-log-sink';
import { createLogEventPayload } from './logging/log-utils';

interface EmitLogEvent {
  (payload: Record<string, unknown>): void;
}

/**
 * Boots the application graph and optionally starts worker/orchestrator roles.
 *
 * @param config Application config.
 * @returns Runtime object with services and stop hook.
 */
export async function createApplication(
  config: AppConfig,
  options?: {
    enableIntakeAgent?: boolean;
  }
) {
  const enableIntakeAgent = options?.enableIntakeAgent ?? true;
  let emitLogEvent: EmitLogEvent | null = null;
  const sessionLogSink = config.logSessionToFile ? new SessionLogFileSink(config.sessionLogDir) : null;
  const logger = createLoggerWithOptions({
    onLog: (record) => {
      const payload = createLogEventPayload(record, config.logVerbose);
      if (!payload) {
        return;
      }
      if (sessionLogSink) {
        sessionLogSink.append(payload);
      }
      if (!emitLogEvent) {
        return;
      }
      emitLogEvent(payload);
    },
  });
  await Promise.all([
    fs.mkdir(config.factoryWorkRoot, { recursive: true }),
    fs.mkdir(config.workspaceRootDir, { recursive: true }),
    fs.mkdir(config.coderDefaultCwd, { recursive: true }),
    fs.mkdir(config.scmRootDir, { recursive: true }),
    ...(config.logSessionToFile ? [fs.mkdir(config.sessionLogDir, { recursive: true })] : []),
  ]);

  const repos = createRepos(config);
  const pullRequestBindingRepo = createPullRequestBindingRepo(config);
  const authRepo = createAuthRepo(config);
  const queue = createQueue(config);
  const eventBus = createEventBus(config);
  await Promise.all([
    repos.sessionRepo.connect(),
    repos.taskRepo.connect(),
    repos.eventRepo.connect(),
    repos.commandRepo.connect(),
    pullRequestBindingRepo.connect(),
    authRepo.connect(),
    queue.connect(),
    eventBus.connect(),
  ]);

  const taskService = new TaskService(repos.taskRepo);
  const eventService = new EventService(repos.eventRepo, eventBus);
  emitLogEvent = (payload) => {
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
    if (!sessionId) {
      return;
    }
    void eventService.emit({
      sessionId,
      type: 'LOG_EMITTED',
      payload,
    });
  };
  const commandService = new CommandService(repos.commandRepo, queue);
  const authService = new AuthService(authRepo, {
    sessionTtlMs: config.authSessionTtlHours * 60 * 60 * 1000,
  });
  const sessionService = new SessionService({ sessionRepo: repos.sessionRepo, taskService, eventService });
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
  const scmWebhookService = new ScmWebhookService(
    {
      eventService,
      bindingRepo: pullRequestBindingRepo,
      logger,
    },
    {
      githubWebhookSecret: config.scmGithubWebhookSecret,
      azureDevOpsWebhookSecret: config.scmAzureDevOpsWebhookSecret,
    }
  );

  const orchestrationService = new OrchestrationService({
    taskService,
    commandService,
    sessionRepo: repos.sessionRepo,
    eventService,
    scmService,
    pullRequestBindingRepo,
    logger,
    logWorkflowProgress: config.logWorkflowProgress,
    workflowConfig,
    workspaceRootDir: config.workspaceRootDir,
  });
  let unsubscribeOrchestration: (() => Promise<void>) | null = null;
  if (config.runOrchestrator) {
    unsubscribeOrchestration = await eventService.subscribe(async (event) => orchestrationService.handleEvent(event));
  }

  const workspace = new LocalWorkspace({ rootDir: config.workspaceRootDir });
  const userIntakeService = enableIntakeAgent
    ? createUserIntakeService(config, sessionService, intakeValidationSchema, logger)
    : null;
  const runtime = createAgentRuntime(config, logger, {
    queue,
    commandService,
    eventService,
    taskService,
    sessionRepo: repos.sessionRepo,
    workspace,
  });

  if (config.runWorker) {
    runtime.start({ pollMs: config.workerPollMs });
  }

  return {
    logger,
    runtime,
    workspace,
    queue,
    services: {
      authService,
      sessionService,
      userIntakeService,
      eventService,
      commandService,
      taskService,
      scmWebhookService,
    },
    async stop(): Promise<void> {
      if (unsubscribeOrchestration) {
        await unsubscribeOrchestration();
      }
      await runtime.stop();
      await Promise.all([
        repos.sessionRepo.close(),
        repos.taskRepo.close(),
        repos.eventRepo.close(),
        repos.commandRepo.close(),
        pullRequestBindingRepo.close(),
        authRepo.close(),
        queue.close(),
        eventBus.close(),
      ]);
    },
  };
}
