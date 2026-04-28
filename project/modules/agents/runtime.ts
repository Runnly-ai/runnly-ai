import { Logger } from '../utils/logger';
import { CommandService } from '../command';
import { EventService } from '../event';
import { TaskService } from '../task';
import { SessionRepo } from '../session';
import { Workspace } from '../workspace';
import { CommandQueue } from '../infra';
import { Command } from '../command';
import { Agent } from './agents/types/agent';

interface RuntimeDeps {
  queue: CommandQueue;
  commandService: CommandService;
  eventService: EventService;
  resolveAgent: (command: Command) => Promise<Agent | null> | Agent | null;
  taskService: TaskService;
  sessionRepo: SessionRepo;
  workspace: Workspace;
  logger: Logger;
  logWorkflowProgress: boolean;
  logAgentDebug: boolean;
}

/**
 * Pulls command ids from the queue and executes them through the mapped agent.
 *
 * This runtime is intentionally thin:
 * - queueing and command state are handled by services/adapters
 * - workflow decisions stay in orchestration (event-driven)
 */
export class AgentRuntime {
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private pollMs = 100;

  /**
   * @param deps Runtime dependencies required for queue consumption and execution.
   */
  constructor(private readonly deps: RuntimeDeps) {}

  /**
   * Starts the worker loop if it is not already running.
   *
   * @param params Start options.
   * @param params.pollMs Dequeue wait timeout in milliseconds.
   * @returns {void}
   */
  start({ pollMs }: { pollMs: number }): void {
    if (this.running) {
      return;
    }
    this.pollMs = pollMs;
    this.running = true;
    if (this.deps.logWorkflowProgress) {
      this.deps.logger.info('worker runtime started', { pollMs: this.pollMs });
    }
    this.loopPromise = this.runLoop();
  }

  /**
   * Requests graceful worker shutdown and waits for loop exit.
   *
   * @returns Promise that resolves when the loop has stopped.
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    this.running = false;
    if (this.deps.logWorkflowProgress) {
      this.deps.logger.info('worker runtime stopping');
    }
    if (this.loopPromise) {
      await this.loopPromise;
      this.loopPromise = null;
    }
    if (this.deps.logWorkflowProgress) {
      this.deps.logger.info('worker runtime stopped');
    }
  }

  /**
   * Main worker loop. It blocks on queue dequeue and processes one command at a time.
   *
   * @returns Promise that resolves after `stop()` flips the running flag and loop exits.
   */
  private async runLoop(): Promise<void> {
    while (this.running) {
      try {
        const commandId = await this.deps.queue.dequeue(this.pollMs);
        if (!commandId) {
          // Timeout/no item: loop again while process is still marked running.
          continue;
        }
        if (this.deps.logWorkflowProgress) {
          this.deps.logger.info('worker dequeued command', { commandId });
        }
        await this.processCommand(commandId);
      } catch (err: unknown) {
        this.deps.logger.error('runtime loop iteration failed', err);
      }
    }
  }

  /**
   * Executes a single command lifecycle:
   * load -> resolve agent -> mark running -> execute -> mark done/failed.
   *
   * @param commandId Command identifier dequeued from the queue adapter.
   * @returns Promise that resolves when this command has been fully handled.
   */
  private async processCommand(commandId: string): Promise<void> {
    const command = await this.deps.commandService.getById(commandId);
    if (!command) {
      // Command may have been deleted or never persisted; skip safely.
      if (this.deps.logWorkflowProgress) {
        this.deps.logger.info('worker skipped missing command', { commandId });
      }
      return;
    }

    // Resolve and build an execution agent at command runtime.
    const agent = await this.deps.resolveAgent(command);
    if (!agent) {
      // Unknown mapping is treated as a terminal command failure.
      await this.deps.commandService.markFailed(command.id);
      await this.deps.eventService.emit({
        sessionId: command.sessionId,
        type: 'COMMAND_FAILED',
        payload: { commandId: command.id, reason: 'No agent capability mapping' },
      });
      if (this.deps.logWorkflowProgress) {
        this.deps.logger.info('worker command failed: no mapped agent', {
          commandId: command.id,
          commandType: command.type,
          sessionId: command.sessionId,
        });
      }
      return;
    }

    try {
      if (this.deps.logWorkflowProgress) {
        this.deps.logger.info('worker processing command', {
          commandId: command.id,
          commandType: command.type,
          sessionId: command.sessionId,
          agentId: agent.id,
        });
      }
      await this.deps.commandService.markRunning(command.id);
      await agent.execute(command, {
        taskService: this.deps.taskService,
        eventService: this.deps.eventService,
        sessionRepo: this.deps.sessionRepo,
        workspace: this.deps.workspace,
        logger: this.deps.logger,
        agentDebugLogging: this.deps.logAgentDebug,
      });
      await this.deps.commandService.markDone(command.id);
      if (this.deps.logWorkflowProgress) {
        this.deps.logger.info('worker command completed', {
          commandId: command.id,
          commandType: command.type,
          sessionId: command.sessionId,
        });
      }
    } catch (error: unknown) {
      // Any runtime/agent exception marks the command failed and emits failure event.
      await this.deps.commandService.markFailed(command.id);
      await this.deps.eventService.emit({
        sessionId: command.sessionId,
        type: 'COMMAND_FAILED',
        payload: { commandId: command.id, reason: String(error) },
      });
      if (this.deps.logWorkflowProgress) {
        this.deps.logger.info('worker command marked failed', {
          commandId: command.id,
          commandType: command.type,
          sessionId: command.sessionId,
        });
      }
      this.deps.logger.error('command execution failed', {
        commandId: command.id,
        commandType: command.type,
        sessionId: command.sessionId,
        error: this.describeError(error),
      });
    }
  }

  private describeError(error: unknown): Record<string, unknown> {
    if (!error || typeof error !== 'object') {
      return { message: String(error) };
    }
    const value = error as { message?: unknown; name?: unknown; stack?: unknown };
    return {
      name: typeof value.name === 'string' ? value.name : undefined,
      message: typeof value.message === 'string' ? value.message : String(error),
      stack: typeof value.stack === 'string' ? value.stack : undefined,
    };
  }
}
