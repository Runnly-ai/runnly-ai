import { TaskValidationSchema } from '../modules/intake/task-validation-schema';

/**
 * High-level intake requirements only.
 * Avoid implementation-level fields here.
 */
export const intakeValidationSchema: TaskValidationSchema = {
  id: 'default-high-level-task-schema',
  description: 'Required high-level fields before downstream orchestration starts.',
  requiredFields: [
    {
      path: 'requirements.objective',
      required: true,
      reason: 'Missing outcome objective.',
      question: 'What outcome do you want to achieve?',
      seedFromGoal: true,
    },
    {
      path: 'requirements.scope',
      required: true,
      reason: 'Missing scope.',
      question: 'What scope should this cover (feature, system area, or boundary)?',
    },
    {
      path: 'requirements.successCriteria',
      required: true,
      reason: 'Missing success criteria.',
      question: 'How should we measure completion or success at a high level?',
    },
    {
      path: 'scm.repoUrl',
      required: true,
      reason: 'Missing SCM repository link.',
      question: 'Please provide the SCM repository URL so delivery automation can run.',
    },
  ],
};
