import { AgentSkill } from './types';

/**
 * Default review skill used by REVIEW_CODE.
 */
const reviewSkill: AgentSkill = {
  id: 'review-skill',
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
