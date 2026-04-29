import { CommandQueue } from '../../infra';
import { createId, nowTs } from '../../utils';
import { CommandRepo } from './command-repo';
import { Command, CommandStatus, CommandType } from './command';

interface DispatchInput {
  sessionId: string;
  type: CommandType;
  payload?: Record<string, unknown>;
}

/**
 * Command lifecycle service.
 */
export class CommandService {
  /**
   * @param commandRepo Command repository implementation.
   * @param queue Command queue adapter.
   */
  constructor(
    private readonly commandRepo: CommandRepo,
    private readonly queue: CommandQueue
  ) {}

  /**
   * Persists and enqueues a command.
   *
   * @param input Dispatch payload.
   * @returns Created command record.
   */
  async dispatch({ sessionId, type, payload }: DispatchInput): Promise<Command> {
    const command: Command = {
      id: createId('cmd'),
      sessionId,
      type,
      payload: payload || {},
      status: CommandStatus.PENDING,
      retryCount: 0,
      createdAt: nowTs(),
      updatedAt: nowTs(),
    };
    await this.commandRepo.create(command);
    await this.queue.enqueue(command.id);
    return command;
  }

  /**
   * @param commandId Command identifier.
   * @returns Command record, or null if not found.
   */
  getById(commandId: string): Promise<Command | null> {
    return this.commandRepo.getById(commandId);
  }

  /**
   * @param sessionId Session identifier.
   * @returns All commands for the session.
   */
  listBySessionId(sessionId: string): Promise<Command[]> {
    return this.commandRepo.listBySessionId(sessionId);
  }

  /**
   * @param commandId Command identifier.
   * @returns Updated command, or null if not found.
   */
  markRunning(commandId: string): Promise<Command | null> {
    return this.commandRepo.update(commandId, {
      status: CommandStatus.RUNNING,
      updatedAt: nowTs(),
    });
  }

  claimPending(commandId: string, claimToken: string): Promise<Command | null> {
    return this.commandRepo.claimPending(commandId, claimToken, nowTs());
  }

  /**
   * @param commandId Command identifier.
   * @returns Updated command, or null if not found.
   */
  markDone(commandId: string): Promise<Command | null> {
    return this.commandRepo.update(commandId, {
      status: CommandStatus.DONE,
      updatedAt: nowTs(),
    });
  }

  /**
   * Marks command as failed and increments retry counter.
   *
   * @param commandId Command identifier.
   * @returns Updated command, or null if not found.
   */
  async markFailed(commandId: string): Promise<Command | null> {
    const current = await this.getById(commandId);
    const retryCount = current ? current.retryCount + 1 : 1;
    return this.commandRepo.update(commandId, {
      status: CommandStatus.FAILED,
      retryCount,
      updatedAt: nowTs(),
    });
  }
}
