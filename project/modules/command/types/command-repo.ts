import { Command } from "./command";


/**
 * Command repository contract.
 */
export interface CommandRepo {
  connect(): Promise<void>;
  create(command: Command): Promise<Command>;
  update(id: string, patch: Partial<Command>): Promise<Command | null>;
  claimPending(id: string, claimToken: string, claimedAt: number): Promise<Command | null>;
  getById(id: string): Promise<Command | null>;
  listBySessionId(sessionId: string): Promise<Command[]>;
  close(): Promise<void>;
}
