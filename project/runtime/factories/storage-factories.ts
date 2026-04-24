import { AppConfig } from '../../config/app-config';
import { CommandQueue, EventBus, InMemoryEventBus, InMemoryQueue, RedisEventBus, RedisQueue } from '../../modules/infra';
import {
  CommandRepo,
  InMemoryCommandRepo,
  RedisCommandRepo,
} from '../../modules/command';
import {
  EventRepo,
  InMemoryEventRepo,
  RedisEventRepo,
} from '../../modules/event';
import {
  RedisSessionRepo,
  InMemorySessionRepo,
  SessionRepo,
} from '../../modules/session';
import {
  RedisTaskRepo,
  InMemoryTaskRepo,
  TaskRepo,
} from '../../modules/task';
import {
  PostgresPullRequestBindingRepo,
  PullRequestBindingRepo,
  SqlitePullRequestBindingRepo,
} from '../../modules/scm';
import { AuthRepo, PostgresAuthRepo, SqliteAuthRepo } from '../../modules/auth';

export interface Repos {
  sessionRepo: SessionRepo;
  taskRepo: TaskRepo;
  eventRepo: EventRepo;
  commandRepo: CommandRepo;
}

/**
 * Creates a command queue adapter from config.
 */
export function createQueue(config: AppConfig): CommandQueue {
  if (config.queueBackend === 'redis') {
    return new RedisQueue(config.redisUrl, config.redisCommandQueueKey);
  }
  return new InMemoryQueue();
}

/**
 * Creates an event bus adapter from config.
 */
export function createEventBus(config: AppConfig): EventBus {
  if (config.eventBusBackend === 'redis') {
    return new RedisEventBus(config.redisUrl, config.redisEventChannel);
  }
  return new InMemoryEventBus();
}

/**
 * Creates repository adapters from config.
 */
export function createRepos(config: AppConfig): Repos {
  if (config.stateBackend === 'redis') {
    return {
      sessionRepo: new RedisSessionRepo(config.redisUrl, config.redisKeyPrefix),
      taskRepo: new RedisTaskRepo(config.redisUrl, config.redisKeyPrefix),
      eventRepo: new RedisEventRepo(config.redisUrl, config.redisKeyPrefix),
      commandRepo: new RedisCommandRepo(config.redisUrl, config.redisKeyPrefix),
    };
  }

  return {
    sessionRepo: new InMemorySessionRepo(),
    taskRepo: new InMemoryTaskRepo(),
    eventRepo: new InMemoryEventRepo(),
    commandRepo: new InMemoryCommandRepo(),
  };
}

/**
 * Creates pull-request binding repository from DB backend config.
 */
export function createPullRequestBindingRepo(config: AppConfig): PullRequestBindingRepo {
  if (config.dbBackend === 'postgres') {
    if (!config.postgresUrl) {
      throw new Error('POSTGRES_URL is required when DB_BACKEND=postgres');
    }
    return new PostgresPullRequestBindingRepo(config.postgresUrl);
  }
  return new SqlitePullRequestBindingRepo(config.sqliteDbPath);
}

/**
 * Creates auth repository from DB backend config.
 */
export function createAuthRepo(config: AppConfig): AuthRepo {
  if (config.dbBackend === 'postgres') {
    if (!config.postgresUrl) {
      throw new Error('POSTGRES_URL is required when DB_BACKEND=postgres');
    }
    return new PostgresAuthRepo(config.postgresUrl);
  }
  return new SqliteAuthRepo(config.sqliteDbPath);
}
