/**
 * Workflow step type - defines the stages of the development workflow.
 */
export type WorkflowStep = 
  | 'PREPARE'       // Pull code and prepare worktree
  | 'PLANNING'      // Create implementation plan
  | 'IMPLEMENTATION' // Generate code changes
  | 'TESTING'       // Run tests and verification
  | 'REVIEW'        // Code review and quality checks
  | 'PUBLISH'       // Push changes and create PR
  | 'SCM_PIPELINE'  // External SCM pipeline checks
  | 'SCM_REVIEW';   // Handle SCM review feedback

/**
 * Workflow configuration - defines the sequence of steps to execute.
 * 
 * This is the only thing users need to configure. The orchestration service
 * handles all internal event dispatching automatically.
 */
export interface WorkflowConfig {
  /**
   * Ordered sequence of workflow steps to execute.
   * The orchestrator will execute each step in order until completion or failure.
   * 
   * Example for planning-only workflow:
   *   steps: ["PLANNING"]
   * 
   * Example for full workflow:
   *   steps: ["PREPARE", "PLANNING", "IMPLEMENTATION", "TESTING", "REVIEW", "PUBLISH"]
   */
  steps: WorkflowStep[];

  /**
   * Whether to retry failed steps (e.g., re-implement after test failure).
   * Defaults to true for TESTING and REVIEW steps.
   */
  retryOnFailure?: {
    TESTING?: boolean;
    REVIEW?: boolean;
  };
}

/**
 * Internal mapping: workflow step → completion event.
 * Used by orchestration service to determine when steps are complete.
 */
export const STEP_COMPLETION_EVENTS: Record<WorkflowStep, string> = {
  'PREPARE': 'SCM_WORKSPACE_PREPARED',
  'PLANNING': 'PLAN_COMPLETED',
  'IMPLEMENTATION': 'IMPLEMENT_COMPLETED',
  'TESTING': 'TEST_PASSED',
  'REVIEW': 'REVIEW_COMPLETED',
  'PUBLISH': 'SCM_PR_CREATED',
  'SCM_PIPELINE': 'SCM_PIPELINE_PASSED',
  'SCM_REVIEW': 'SCM_REVIEW_COMMENT_ADDED',
};

/**
 * Internal mapping: workflow step → failure event.
 * Used by orchestration service for retry logic.
 */
export const STEP_FAILURE_EVENTS: Partial<Record<WorkflowStep, string>> = {
  'TESTING': 'TEST_FAILED',
  'REVIEW': 'REVIEW_FAILED',
  'SCM_PIPELINE': 'SCM_PIPELINE_FAILED',
};
