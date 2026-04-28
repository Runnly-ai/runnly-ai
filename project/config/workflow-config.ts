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
 * ReAct workflow: Uses ReAct agent for combined planning and implementation.
 * Prepare → ReAct → Publish
 * The ReAct agent iteratively reasons and acts until the task is complete.
 */
export const reactWorkflow: WorkflowConfig = {
  steps: ['PREPARE', 'REACT', 'PUBLISH'],
};

export const fastScmWorkflow: WorkflowConfig = {
  steps: [
    'PREPARE',
    'REACT',
    'PUBLISH',
    'SCM_PIPELINE',
    'SCM_REVIEW',
  ],
};

/**
 * ReAct workflow with testing and review: Prepare → ReAct → Test → Review → Publish
 * Uses ReAct for implementation with validation steps.
 */
export const reactFullWorkflow: WorkflowConfig = {
  steps: ['PREPARE', 'REACT', 'TESTING', 'REVIEW', 'PUBLISH'],
  retryOnFailure: {
    TESTING: true,
    REVIEW: true,
  },
};

/**
 * ReAct workflow with SCM integration: Prepare → ReAct → Publish → SCM Pipeline
 * Quick iteration with ReAct agent and external CI/CD validation.
 */
export const reactScmWorkflow: WorkflowConfig = {
  steps: ['PREPARE', 'REACT', 'PUBLISH', 'SCM_PIPELINE', 'SCM_REVIEW'],
  retryOnFailure: {
    TESTING: true,
    REVIEW: true,
  },
};

/**
 * Registry of all available workflows.
 * Use getWorkflowByName() to select a workflow dynamically.
 */
export const WORKFLOW_REGISTRY: Record<string, WorkflowConfig> = {
  'DEFAULT': defaultWorkflowConfig,
  'PLANNING_ONLY': planningOnlyWorkflow,
  'IMPLEMENTATION_ONLY': implementationOnlyWorkflow,
  'SCM': scmWorkflow,
  'FAST_SCM': fastScmWorkflow,
  'QUICK_SCM': quickscmWorkflow,
  'REACT': reactWorkflow,
  'REACT_FULL': reactFullWorkflow,
  'REACT_SCM': reactScmWorkflow,
};

/**
 * Get workflow configuration by name.
 * @param name - Workflow name from WORKFLOW_REGISTRY
 * @param fallback - Fallback workflow if name not found (defaults to quick-scm)
 * @returns WorkflowConfig
 */
export function getWorkflowByName(
  name?: string,
  fallback: WorkflowConfig = quickscmWorkflow
): WorkflowConfig {
  if (!name) {
    return fallback;
  }
  return WORKFLOW_REGISTRY[name] || fallback;
}

/**
 * Active workflow name - can be set via environment variable or config.
 * Valid values: 'DEFAULT', 'PLANNING_ONLY', 'IMPLEMENTATION_ONLY', 'SCM', 
 *               'QUICK_SCM', 'REACT', 'REACT_FULL', 'REACT_SCM', 'FAST_SCM'
 */
const ACTIVE_WORKFLOW_NAME = process.env.WORKFLOW_NAME || 'QUICK_SCM';

/**
 * Active workflow configuration.
 * To change workflow, set WORKFLOW_NAME environment variable or modify ACTIVE_WORKFLOW_NAME above.
 */
export const workflowConfig: WorkflowConfig = getWorkflowByName(ACTIVE_WORKFLOW_NAME);
