import { AgentSkill } from './types';

/**
 * Default review skill used by REVIEW_CODE.
 */
const reviewSkill: AgentSkill = {
  id: 'review-skill',
  title: 'Built-in Review Skill',
  description: 'Marks review tasks as completed with a minimal output.',
  async execute({ taskId }) {
    return {
      taskStatus: 'DONE' as const,
      taskOutput: { reviewed: true },
      eventType: 'REVIEW_COMPLETED',
      eventPayload: { taskId },
    };
  },
};

export default reviewSkill;
