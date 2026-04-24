
import { CommandType } from '../command';
import { Agent } from './agents/types/agent';

const COMMAND_CAPABILITY: Record<CommandType, string> = {
  PLAN: 'plan',
  GENERATE: 'generate',
  FIX: 'generate',
  VERIFY: 'verify',
  REVIEW: 'review',
};

/**
 * Resolves an agent by required command capability.
 */
export class AgentRegistry {
  /**
   * @param agents Available agents.
   */
  constructor(private readonly agents: Agent[]) {}

  /**
   * @param commandType Command type to resolve.
   * @returns Matching agent, or null if no capability mapping exists.
   */
  resolve(commandType: CommandType): Agent | null {
    const capability = COMMAND_CAPABILITY[commandType];
    return this.agents.find((agent) => agent.capabilities.includes(capability)) || null;
  }
}
