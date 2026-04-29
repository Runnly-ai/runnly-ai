
import { Command } from './types/command';
import { CommandRepo } from './types/command-repo';
import { CommandStatus } from './types/command';

/**
 * In-memory command repository.
 */
export class InMemoryCommandRepo implements CommandRepo {
  private commands: Command[] = [];

  /**
   * @returns Promise resolved immediately.
   */
  async connect(): Promise<void> {}

  /**
   * @param command Command record to create.
   * @returns Stored command.
   */
  async create(command: Command): Promise<Command> {
    this.commands.push(command);
    return command;
  }

  /**
   * @param id Command id.
   * @param patch Partial command update.
   * @returns Updated command, or null.
   */
  async update(id: string, patch: Partial<Command>): Promise<Command | null> {
    const idx = this.commands.findIndex((command) => command.id === id);
    if (idx < 0) {
      return null;
    }
    const next = { ...this.commands[idx], ...patch };
    this.commands[idx] = next;
    return next;
  }

  async claimPending(id: string, claimToken: string, claimedAt: number): Promise<Command | null> {
    const idx = this.commands.findIndex((command) => command.id === id);
    if (idx < 0) {
      return null;
    }
    const current = this.commands[idx];
    if (current.status !== CommandStatus.PENDING) {
      return null;
    }
    const next: Command = {
      ...current,
      status: CommandStatus.RUNNING,
      claimToken,
      claimedAt,
      updatedAt: claimedAt,
    };
    this.commands[idx] = next;
    return next;
  }

  /**
   * @param id Command id.
   * @returns Command record, or null.
   */
  async getById(id: string): Promise<Command | null> {
    return this.commands.find((command) => command.id === id) || null;
  }

  /**
   * @param sessionId Session id.
   * @returns Commands for this session.
   */
  async listBySessionId(sessionId: string): Promise<Command[]> {
    return this.commands.filter((command) => command.sessionId === sessionId);
  }

  /**
   * @returns Promise resolved immediately.
   */
  async close(): Promise<void> {}
}
