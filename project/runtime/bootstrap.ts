import fs from 'node:fs/promises';
import { AppConfig } from '../config/app-config';
import { AuthRepo } from '../modules/auth';
import { CommandRepo } from '../modules/command';
import { EventRepo } from '../modules/event';
import { CommandQueue, EventBus } from '../modules/infra';
import { PullRequestBindingRepo } from '../modules/scm';
import { SessionRepo } from '../modules/session';
import { TaskRepo } from '../modules/task';
import { createLoggerWithOptions, Logger } from '../modules/utils/logger';
import { createAuthRepo, createEventBus, createPullRequestBindingRepo, createQueue, createRepos } from './factories/storage-factories';
import { createLogEventPayload } from './logging/log-utils';
import { SessionLogFileSink } from './logging/session-log-sink';

export interface RuntimeStorage {
  repos: {
    sessionRepo: SessionRepo;
    taskRepo: TaskRepo;
    eventRepo: EventRepo;
    commandRepo: CommandRepo;
  };
  pullRequestBindingRepo: PullRequestBindingRepo;
  authRepo: AuthRepo;
  queue: CommandQueue;
  eventBus: EventBus;
}

export async function createBaseLogger(config: AppConfig): Promise<{
  logger: Logger;
  setEmitLogEvent: (emit: ((payload: Record<string, unknown>) => void) | null) => void;
}> {
  let emitLogEvent: ((payload: Record<string, unknown>) => void) | null = null;
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
      if (emitLogEvent) {
        emitLogEvent(payload);
      }
    },
  });

  await Promise.all([
    fs.mkdir(config.factoryWorkRoot, { recursive: true }),
    fs.mkdir(config.workspaceRootDir, { recursive: true }),
    fs.mkdir(config.coderDefaultCwd, { recursive: true }),
    fs.mkdir(config.scmRootDir, { recursive: true }),
    ...(config.logSessionToFile ? [fs.mkdir(config.sessionLogDir, { recursive: true })] : []),
  ]);

  return {
    logger,
    setEmitLogEvent(emit) {
      emitLogEvent = emit;
    },
  };
}

export async function connectRuntimeStorage(config: AppConfig): Promise<RuntimeStorage> {
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

  return {
    repos,
    pullRequestBindingRepo,
    authRepo,
    queue,
    eventBus,
  };
}

export async function closeRuntimeStorage(storage: RuntimeStorage): Promise<void> {
  await Promise.all([
    storage.repos.sessionRepo.close(),
    storage.repos.taskRepo.close(),
    storage.repos.eventRepo.close(),
    storage.repos.commandRepo.close(),
    storage.pullRequestBindingRepo.close(),
    storage.authRepo.close(),
    storage.queue.close(),
    storage.eventBus.close(),
  ]);
}
