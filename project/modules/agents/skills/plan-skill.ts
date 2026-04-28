import { AgentSkill } from './types';

/**
 * Default plan skill used by PLAN_TASK.
 *
 * This is intentionally simple for now and can be replaced by an LLM-backed
 * implementation without changing runtime wiring.
 */
const planSkill: AgentSkill = {
  id: 'plan-skill',
  title: 'Built-in Plan Skill',
  description: 'Creates a minimal plan artifact for planning tasks.',
  async execute({ taskId }): Promise<{
    taskStatus: 'DONE';
    taskOutput: Record<string, unknown>;
    eventType: string;
    eventPayload: Record<string, unknown>;
  }> {
    return {
      taskStatus: 'DONE',
      taskOutput: { plan: 'Plan created by skill agent.' },
      eventType: 'PLAN_COMPLETED',
      eventPayload: { taskId },
    };
  },
};

export default planSkill;
