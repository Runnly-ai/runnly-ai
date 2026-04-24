import { WorkflowConfig } from "../modules/orchestration/types";

/**
 * Full workflow: Prepare → Plan → Implement → Test → Review → Publish
 * Includes retry logic for test and review failures.
 */
export const defaultWorkflowConfig: WorkflowConfig = {
  steps: [
    'PREPARE',
    'PLANNING',
    'IMPLEMENTATION',
    'TESTING',
    'REVIEW',
    'PUBLISH',
  ],
  retryOnFailure: {
    TESTING: true,  // Re-implement if tests fail
    REVIEW: true,   // Re-implement if review fails
  },
};

/**
 * Planning-only workflow: Only creates a plan, then completes.
 * Useful for analyzing requirements without implementation.
 */
export const planningOnlyWorkflow: WorkflowConfig = {
  steps: ['PLANNING'],
};

/**
 * Implementation workflow: Prepare → Plan → Implement → Publish
 * Generates code and creates a PR without testing or review.
 */
export const implementationOnlyWorkflow: WorkflowConfig = {
  steps: ['PREPARE', 'PLANNING', 'IMPLEMENTATION', 'PUBLISH'],
};

/**
 * Full workflow with SCM integration: Prepare → Plan → Implement → Test → Review → Publish → SCM Pipeline
 * Waits for external CI/CD pipeline and handles review feedback.
 */
export const scmWorkflow: WorkflowConfig = {
  steps: [
    'PREPARE',
    'PLANNING',
    'IMPLEMENTATION',
    'TESTING',
    'REVIEW',
    'PUBLISH',
    'SCM_PIPELINE',
    'SCM_REVIEW',
  ],
  retryOnFailure: {
    TESTING: true,
    REVIEW: true,
  },
};

export const quickscmWorkflow: WorkflowConfig = {
  steps: [
    'PREPARE',
    'PLANNING',
    'IMPLEMENTATION',
    'PUBLISH',
    'SCM_PIPELINE',
    'SCM_REVIEW',
  ],
  retryOnFailure: {
    TESTING: true,
    REVIEW: true,
  },
};

/**
 * Active workflow configuration.
 * Change this to use a different workflow.
 */
export const workflowConfig: WorkflowConfig = quickscmWorkflow;
