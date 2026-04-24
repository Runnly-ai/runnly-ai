import { Command } from '../../command';
import { AgentProviderRunResult } from './types/agent-provider';
import { AgentProviderRouter } from './providers/agent-provider-router';
import { RoleAgent } from './role-agent';

/**
 * Planning role agent.
 */
export class PlanningRoleAgent extends RoleAgent {
  constructor(providerRouter: AgentProviderRouter, options: ConstructorParameters<typeof RoleAgent>[3]) {
    super('planning-agent', 'plan', providerRouter, options);
  }

  protected decide(command: Command, result: AgentProviderRunResult) {
    const taskId = String(command.payload.taskId || '');
    return {
      status: 'DONE' as const,
      eventType: 'PLAN_COMPLETED',
      taskOutput: {
        plan: result.stdout,
      },
      eventPayload: { taskId },
    };
  }
}
