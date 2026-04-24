import { AppConfig } from '../config/app-config';
import { CommandService } from '../modules/command';
import { EventService } from '../modules/event';
import { TaskService } from '../modules/task';
import { LocalWorkspace } from '../modules/workspace';
import { createAgentRuntime } from '../runtime/factories/agent-factories';
import { closeRuntimeStorage, connectRuntimeStorage, createBaseLogger } from '../runtime/bootstrap';

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

  const commandService = new CommandService(storage.repos.commandRepo, storage.queue);
  const workspace = new LocalWorkspace({ rootDir: config.workspaceRootDir });
  const runtime = createAgentRuntime(config, logger, {
    queue: storage.queue,
    commandService,
    eventService,
    taskService,
    workspace,
  });
  runtime.start({ pollMs: config.workerPollMs });

  return {
    logger,
    workspace,
    services: {
      eventService,
      commandService,
      taskService,
      runtime,
    },
    async stop(): Promise<void> {
      await runtime.stop();
      await closeRuntimeStorage(storage);
    },
  };
}
