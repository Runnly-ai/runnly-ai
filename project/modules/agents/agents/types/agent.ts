import { Logger } from '../../../utils/logger';
import { EventService } from '../../../event';
import { TaskService } from '../../../task';
import { Workspace } from '../../../workspace';
import { Command } from '../../../command';
import { SessionRepo } from '../../../session';

/**
 * Shared dependencies passed to all agent executions.
 */
export interface AgentContext {
  taskService: TaskService;
  eventService: EventService;
  sessionRepo?: SessionRepo;
  workspace: Workspace;
  logger: Logger;
  workspaceRoot?: string;
  agentDebugLogging?: boolean;
}

/**
 * Base class for capability-based agents.
 */
export abstract class Agent {
  /**
   * @param id Agent identifier.
   * @param capabilities Capability tags used for command routing.
   */
  constructor(
    public readonly id: string,
    public readonly capabilities: string[]
  ) {}

  /**
   * Executes one command.
   *
   * @param command Command payload.
   * @param context Runtime services for execution.
   * @returns Promise resolved when command handling is complete.
   */
  abstract execute(command: Command, context: AgentContext): Promise<void>;
}
