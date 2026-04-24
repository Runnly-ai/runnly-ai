import { AppConfig } from '../config/app-config';
import { CommandService } from '../modules/command';
import { EventService } from '../modules/event';
import { OrchestrationService } from '../modules/orchestration/orchestration-service';
import { AzureDevOpsScmProvider, GitHubScmProvider, ScmProvider, ScmProviderType, ScmService } from '../modules/scm';
import { TaskService } from '../modules/task';
import { workflowConfig } from '../config/workflow-config';
import { closeRuntimeStorage, connectRuntimeStorage, createBaseLogger } from '../runtime/bootstrap';

export async function createOrchestratorApplication(config: AppConfig) {
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

  const unsubscribe = await eventService.subscribe(async (event) => orchestrationService.handleEvent(event));

  return {
    logger,
    services: {
      eventService,
      commandService,
      taskService,
      orchestrationService,
    },
    async stop(): Promise<void> {
      await unsubscribe();
      await closeRuntimeStorage(storage);
    },
  };
}
