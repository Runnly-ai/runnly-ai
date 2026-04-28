import { TaskValidationSchema } from '../modules/intake/task-validation-schema';

/**
 * Minimal intake requirements - only essential information.
 * The LLM will intelligently gather details, not rigid template questions.
 * 
 * Philosophy: Keep REQUIRED fields minimal (blocking).
 * The planning agent explores the repo and gathers detailed context.
 */
export const intakeValidationSchema: TaskValidationSchema = {
  id: 'default-high-level-task-schema',
  description: 'Essential fields before downstream orchestration starts.',
  requiredFields: [
    {
      path: 'goal',
      required: true,  // ← BLOCKING: Must have this to proceed
      reason: 'Missing task goal.',
      question: 'What would you like me to help you build or change?',
      seedFromGoal: false,
    },
    {
      path: 'scm.repoUrl',
      required: true,  // ← BLOCKING: Must have this to proceed
      reason: 'Missing repository URL.',
      question: 'Which repository should I work on? Please provide the Git URL.',
    },
    // Optional: Uncomment to gather additional context upfront
    // {
    //   path: 'context.constraints',
    //   required: false,  // ← NON-BLOCKING: Nice to have
    //   reason: 'Optional constraints.',
    //   question: 'Are there any constraints or requirements I should know about?',
    // },
    // {
    //   path: 'context.framework',
    //   required: false,  // ← NON-BLOCKING: Planning agent can discover this
    //   reason: 'Optional framework hint.',
    //   question: 'What framework/stack is this project using?',
    // },
  ],
};
