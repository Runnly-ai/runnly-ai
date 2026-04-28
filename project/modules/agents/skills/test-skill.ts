import { AgentSkill } from './types';

/**
 * Default test skill used by RUN_TESTS.
 */
const testSkill: AgentSkill = {
  id: 'test-skill',
  title: 'Built-in Test Skill',
  description: 'Runs a simple pass/fail simulation for verification tasks.',
  async execute({ command, taskId }) {
    const shouldFail = Boolean(command.payload.shouldFail);
    if (shouldFail) {
      return {
        taskStatus: 'FAILED' as const,
        taskOutput: { reason: 'Simulated test failure' },
        eventType: 'TEST_FAILED',
        eventPayload: { taskId },
      };
    }
    return {
      taskStatus: 'DONE' as const,
      taskOutput: { passed: true },
      eventType: 'TEST_PASSED',
      eventPayload: { taskId },
    };
  },
};

export default testSkill;
