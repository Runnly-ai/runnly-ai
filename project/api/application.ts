import { AppConfig } from '../config/app-config';
import { AuthService } from '../modules/auth';
import { CommandService } from '../modules/command';
import { EventService } from '../modules/event';
import { UserIntakeService } from '../modules/intake';
import { AzureDevOpsScmProvider, GitHubScmProvider, ScmProvider, ScmProviderType, ScmService, ScmWebhookService } from '../modules/scm';
import { SessionService } from '../modules/session';
import { TaskService } from '../modules/task';
import { LocalWorkspace } from '../modules/workspace';
import { intakeValidationSchema } from '../config/intake-validation-schema';
import { createUserIntakeService } from '../runtime/factories/agent-factories';
import { closeRuntimeStorage, connectRuntimeStorage, createBaseLogger } from '../runtime/bootstrap';

export async function createApiApplication(config: AppConfig) {
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

  const commandService = new CommandService(storage.repos.commandRepo, storage.queue);
  const authService = new AuthService(storage.authRepo, {
    sessionTtlMs: config.authSessionTtlHours * 60 * 60 * 1000,
  });
  const sessionService = new SessionService({
    sessionRepo: storage.repos.sessionRepo,
    taskService,
    eventService,
  });
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
  const workspace = new LocalWorkspace({ rootDir: config.workspaceRootDir });

  const userIntakeService: UserIntakeService = createUserIntakeService(
    config,
    sessionService,
    intakeValidationSchema,
    logger
  );

  const scmWebhookService = new ScmWebhookService(
    {
      eventService,
      bindingRepo: storage.pullRequestBindingRepo,
      logger,
    },
    {
      githubWebhookSecret: config.scmGithubWebhookSecret,
      azureDevOpsWebhookSecret: config.scmAzureDevOpsWebhookSecret,
    }
  );

  return {
    logger,
    workspace,
    queue: storage.queue, // Expose queue for session enqueueing
    services: {
      authService,
      sessionService,
      userIntakeService,
      eventService,
      commandService,
      taskService,
      scmService,
      scmWebhookService,
    },
    async stop(): Promise<void> {
      await closeRuntimeStorage(storage);
    },
  };
}
