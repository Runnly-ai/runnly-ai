import { SessionRepo } from '../session';
import { CommandService } from '../command';
import { EventRecord, EventService } from '../event';
import { TaskService } from '../task';
import { TaskStatus, TaskType } from '../task/types/task';
import { Session, SessionStatus } from '../session/types/session';
import { detectScmProvider, PullRequestBindingRepo, ScmService, ScmSessionConfig, ScmWorkspaceInfo } from '../scm';
import { Logger } from '../utils/logger';
import { SessionContext, SessionScmContext, normalizeSessionContext } from '../session';
import fs from 'node:fs/promises';
import path from 'node:path';
import { WorkflowConfig, WorkflowStep, STEP_COMPLETION_EVENTS, STEP_FAILURE_EVENTS } from './types';
import { defaultWorkflowConfig } from '../../config/workflow-config';


interface OrchestrationDeps {
  taskService: TaskService;
  commandService: CommandService;
  sessionRepo: SessionRepo;
  eventService: EventService;
  scmService?: ScmService;
  pullRequestBindingRepo?: PullRequestBindingRepo;
  logger: Logger;
  logWorkflowProgress: boolean;
  workflowConfig?: WorkflowConfig;
  workspaceRootDir: string;
}

/**
 * Central workflow orchestrator.
 * 
 * Architecture:
 * - Users configure STEPS (e.g., ['PLANNING', 'IMPLEMENTATION', 'TESTING'])
 * - Steps control what gets executed in the session lifecycle
 * - Internally, steps are mapped to EVENTS (e.g., 'PLAN_COMPLETED', 'IMPLEMENT_COMPLETED')
 * - The orchestrator listens for events and dispatches COMMANDS (e.g., 'PLAN', 'GENERATE', 'VERIFY')
 * - Commands are ONLY dispatched if the target step is enabled in the workflow
 * 
 * Example: steps: ['PLANNING'] means:
 *   - SESSION_STARTED triggers PLAN command
 *   - PLAN_COMPLETED does NOT trigger GENERATE (IMPLEMENTATION not in workflow)
 *   - Session completes after PLANNING step
 * 
 * Users only need to know about steps. Events and commands are internal implementation details.
 */
export class OrchestrationService {
  private readonly config: WorkflowConfig;
  private readonly enabledTransitions: Set<string>;

  /**
   * @param deps Service dependencies.
   */
  constructor(private readonly deps: OrchestrationDeps) {
    this.config = deps.workflowConfig || defaultWorkflowConfig;
    this.enabledTransitions = new Set(this.convertStepsToTransitions());
  }

  /**
   * Checks if a workflow step is enabled in the current configuration.
   */
  private isStepEnabled(step: WorkflowStep): boolean {
    return this.config.steps.includes(step);
  }

  /**
   * Converts workflow steps to enabled event transitions.
   * This is internal - users don't need to know about events, just steps.
   */
  private convertStepsToTransitions(): string[] {
    const transitions: string[] = ['SESSION_STARTED', 'COMMAND_FAILED', 'SCM_PUBLISH_FAILED'];
    const steps = this.config.steps || [];
    
    for (const step of steps) {
      // Add completion event
      transitions.push(STEP_COMPLETION_EVENTS[step]);
      
      // Add failure event if retries are enabled for this step
      const failureEvent = STEP_FAILURE_EVENTS[step];
      if (failureEvent) {
        const shouldRetry = 
          (step === 'TESTING' && this.config.retryOnFailure?.TESTING !== false) ||
          (step === 'REVIEW' && this.config.retryOnFailure?.REVIEW !== false) ||
          (step === 'SCM_PIPELINE'); // SCM_PIPELINE always includes failure events
        
        if (shouldRetry) {
          transitions.push(failureEvent);
        }
      }
    }

    return transitions;
  }

  /**
   * Handles a workflow event and executes transition logic.
   *
   * @param event Incoming event.
   * @returns Promise resolved after transition handling.
   */
  async handleEvent(event: EventRecord): Promise<void> {
    if (event.type === 'LOG_EMITTED') {
      // Ignore telemetry-only events to prevent recursive log -> event -> log loops.
      return;
    }

    this.log('orchestrator received event', {
      sessionId: event.sessionId,
      type: event.type,
      eventId: event.id,
    });

    // Check if this event's step is enabled in the workflow config
    const isEnabled = this.enabledTransitions.has(event.type);
    if (!isEnabled) {
      this.log('orchestrator skipped event (step not in workflow)', {
        sessionId: event.sessionId,
        eventType: event.type,
      });
      return;
    }

    // Check if this completes the last workflow step - if so, complete session after handling
    const isLastTransition = this.isLastEnabledTransition(event.type);
    const shouldCompleteAfter = isLastTransition && event.type !== 'REVIEW_COMPLETED';

    switch (event.type) {
      case 'SESSION_STARTED':
        await this.handleSessionStarted(event);
        break;
      case 'SCM_WORKSPACE_PREPARED':
        await this.handlePrepareCompleted(event);
        break;
      case 'PLAN_COMPLETED':
        await this.handlePlanCompleted(event);
        break;
      case 'IMPLEMENT_COMPLETED':
        await this.handleImplementCompleted(event);
        break;
      case 'TEST_FAILED':
        await this.handleTestFailed(event);
        break;
      case 'TEST_PASSED':
        await this.handleTestPassed(event);
        break;
      case 'REVIEW_COMPLETED':
        await this.handleReviewCompleted(event);
        break;
      case 'REVIEW_FAILED':
        await this.handleReviewFailed(event);
        break;
      case 'COMMAND_FAILED':
        await this.handleCommandFailed(event);
        break;
      case 'SCM_PUBLISH_FAILED':
        await this.handleScmPublishFailed(event);
        break;
      case 'SCM_PIPELINE_FAILED':
        await this.handleScmPipelineFailed(event);
        break;
      case 'SCM_REVIEW_COMMENT_ADDED':
        await this.handleScmReviewCommentAdded(event);
        break;
      case 'SCM_PIPELINE_PASSED':
        await this.handleScmPipelinePassed(event);
        break;
      case 'SCM_PR_CREATED':
        // Transition to next SCM step or complete session.
        break;
      default:
        return;
    }

    // Complete session if this was the last workflow step
    if (shouldCompleteAfter) {
      await this.completeSession(event.sessionId);
      this.log('orchestrator completed session after final workflow step', {
        sessionId: event.sessionId,
        finalStep: this.config.steps[this.config.steps.length - 1],
      });
    }
  }

  /**
   * Checks if the given event marks the completion of the final workflow step.
   * Used to determine when to auto-complete the session.
   */
  private isLastEnabledTransition(eventType: string): boolean {
    const lastStep = this.config.steps[this.config.steps.length - 1];
    if (!lastStep) return false;

    const completionEvent = STEP_COMPLETION_EVENTS[lastStep];
    return eventType === completionEvent;
  }

  /**
   * @param event SESSION_STARTED event.
   * @returns Promise resolved after PREPARE or PLAN task dispatch.
   */
  private async handleSessionStarted(event: EventRecord): Promise<void> {
    const session = await this.deps.sessionRepo.getById(event.sessionId);
    const workspaceId = this.extractWorkspaceId(session?.context);

    // Only trigger PREPARE if it's in the workflow
    if (this.isStepEnabled('PREPARE')) {
      const scmConfig = this.extractScmConfig(session?.context);
      if (session && scmConfig && this.deps.scmService) {
        this.log('orchestrator starting workflow step: PREPARE', { sessionId: event.sessionId });
        const workspace = await this.deps.scmService.prepareWorkspace({
          sessionId: event.sessionId,
          workspaceId,
          config: scmConfig,
        });
        await this.updateSessionScmContext(event.sessionId, session.context, {
          ...scmConfig,
          workspace,
        });
        await this.deps.eventService.emit({
          sessionId: event.sessionId,
          type: 'SCM_WORKSPACE_PREPARED',
          payload: {
            workspaceId,
            provider: scmConfig.provider,
            repoUrl: scmConfig.repoUrl,
            worktreeDir: workspace.worktreeDir,
            branch: workspace.branch,
            baseBranch: workspace.baseBranch,
          },
        });
      }
      return;
    }

    // If PREPARE is NOT enabled, go straight to PLANNING
    this.log('orchestrator skipping PREPARE step (not in workflow)', { sessionId: event.sessionId });
    await this.triggerPlanning(event.sessionId);
  }

  /**
   * @param event SCM_WORKSPACE_PREPARED event.
   * @returns Promise resolved after transition to PLANNING.
   */
  private async handlePrepareCompleted(event: EventRecord): Promise<void> {
    this.log('orchestrator completed workflow step: PREPARE', { sessionId: event.sessionId });
    
    // Always trigger PLANNING if it is enabled.
    if (this.isStepEnabled('PLANNING')) {
      await this.triggerPlanning(event.sessionId);
    }
  }

  /**
   * Helper to trigger the planning task.
   */
  private async triggerPlanning(sessionId: string): Promise<void> {
    const session = await this.deps.sessionRepo.getById(sessionId);
    const workspaceId = this.extractWorkspaceId(session?.context);
    const scmWorkspace = this.extractScmWorkspace(session?.context);
    const cwd = scmWorkspace?.worktreeDir || await this.ensureSessionAgentDir(sessionId, workspaceId);

    const executionContext = this.buildExecutionContextPayload(session);
    const task = await this.deps.taskService.createTask({
      sessionId: sessionId,
      type: TaskType.PLAN,
      title: 'Create implementation plan',
      input: executionContext,
    });

    await this.deps.commandService.dispatch({
      sessionId: sessionId,
      type: 'PLAN',
      payload: {
        taskId: task.id,
        cwd,
        enableTools: true,
        ...executionContext,
      },
    });
    this.log('orchestrator started workflow step: PLANNING', { sessionId, taskId: task.id });
  }

  /**
   * @param event PLAN_COMPLETED event.
   * @returns Promise resolved after IMPLEMENT task dispatch.
   */
  private async handlePlanCompleted(event: EventRecord): Promise<void> {
    const session = await this.deps.sessionRepo.getById(event.sessionId);
    const workspaceId = this.extractWorkspaceId(session?.context);
    const planOutputDir = await this.ensureSessionOutputDir(event.sessionId, workspaceId);
    const planTaskId = String(event.payload.taskId || '');
    const planFilePath = await this.persistPlanFile(event.sessionId, planTaskId, planOutputDir);

    // Only dispatch GENERATE if IMPLEMENTATION step is in the workflow.
    if (!this.isStepEnabled('IMPLEMENTATION')) {
      this.log('orchestrator skipped IMPLEMENTATION step (not in workflow)', {
        sessionId: event.sessionId,
      });
      return;
    }

    this.log('orchestrator dispatching GENERATE command', {
      sessionId: event.sessionId,
      planTaskId,
      planFilePath,
    });

    const scmWorkspace = this.extractScmWorkspace(session?.context);
    const cwd = scmWorkspace?.worktreeDir || await this.ensureSessionAgentDir(event.sessionId, workspaceId);
    const executionContext = this.buildExecutionContextPayload(session);
    const task = await this.deps.taskService.createTask({
      sessionId: event.sessionId,
      type: TaskType.IMPLEMENT,
      title: 'Implement planned changes',
      input: {
        planTaskId: event.payload.taskId,
        ...(planFilePath ? { planFilePath } : {}),
      },
    });

    await this.deps.commandService.dispatch({
      sessionId: event.sessionId,
      type: 'GENERATE',
      payload: {
        taskId: task.id,
        cwd,
        ...executionContext,
        ...(planTaskId ? { planTaskId } : {}),
        ...(planFilePath ? { planFilePath } : {}),
      },
    });
    this.log('orchestrator started workflow step: IMPLEMENTATION', { sessionId: event.sessionId, taskId: task.id });
  }

  /**
   * @param event IMPLEMENT_COMPLETED event.
   * @returns Promise resolved after conditional TEST dispatch.
   */
  private async handleImplementCompleted(event: EventRecord): Promise<void> {
    const implementTasks = await this.deps.taskService.listBySessionAndType(event.sessionId, TaskType.IMPLEMENT);
    const unfinished = implementTasks.some((task) => task.status !== TaskStatus.DONE);
    if (unfinished) {
      this.log('orchestrator waiting for IMPLEMENTATION step to complete', {
        sessionId: event.sessionId,
      });
      return;
    }

    // Only dispatch VERIFY if TESTING step is in the workflow
    if (!this.isStepEnabled('TESTING')) {
      this.log('orchestrator skipped TESTING step (not in workflow)', {
        sessionId: event.sessionId,
      });

      // If PUBLISH is enabled, trigger it now.
      if (this.isStepEnabled('PUBLISH')) {
        await this.publishChanges(event.sessionId);
      }
      return;
    }

    const testTask = await this.deps.taskService.createTask({
      sessionId: event.sessionId,
      type: TaskType.TEST,
      title: 'Run validation tests',
    });
    const session = await this.deps.sessionRepo.getById(event.sessionId);
    const workspaceId = this.extractWorkspaceId(session?.context);
    const scmWorkspace = this.extractScmWorkspace(session?.context);
    const cwd = scmWorkspace?.worktreeDir || await this.ensureSessionAgentDir(event.sessionId, workspaceId);
    const executionContext = this.buildExecutionContextPayload(session);

    await this.deps.commandService.dispatch({
      sessionId: event.sessionId,
      type: 'VERIFY',
      payload: {
        taskId: testTask.id,
        cwd,
        ...executionContext,
      },
    });
    this.log('orchestrator started workflow step: TESTING', { sessionId: event.sessionId, taskId: testTask.id });
  }

  /**
   * Commits and pushes changes, creates PR, and emits SCM_PR_CREATED event.
   */
  private async publishChanges(sessionId: string): Promise<void> {
    const session = await this.deps.sessionRepo.getById(sessionId);
    if (!session || !this.deps.scmService) {
      return;
    }

    const scmConfig = this.extractScmConfig(session.context);
    const scmWorkspace = this.extractScmWorkspace(session.context);
    if (!scmConfig || !scmWorkspace) {
      return;
    }

    try {
      this.log('orchestrator publishing changes', { sessionId });
      const publishResult = await this.deps.scmService.publishAndCollectFeedback({
        sessionId,
        config: scmConfig,
        workspace: scmWorkspace,
      });

      await this.updateSessionScmContext(sessionId, session.context, {
        ...scmConfig,
        workspace: scmWorkspace,
        publish: publishResult,
      });

      if (publishResult.changed && publishResult.pullRequest) {
        const repository = this.deps.scmService.parseRepository(scmConfig);
        if (this.deps.pullRequestBindingRepo) {
          const now = Date.now();
          await this.deps.pullRequestBindingRepo.upsert({
            provider: repository.provider,
            repository: repository.displayName.toLowerCase(),
            pullRequestNumber: publishResult.pullRequest.number,
            sessionId: sessionId,
            createdAt: now,
            updatedAt: now,
          });
        }

        await this.deps.eventService.emit({
          sessionId,
          type: 'SCM_PR_CREATED',
          payload: {
            id: publishResult.pullRequest.id,
            number: publishResult.pullRequest.number,
            url: publishResult.pullRequest.url,
          },
        });
      } else {
        await this.deps.eventService.emit({
          sessionId,
          type: 'SCM_NO_CHANGES',
          payload: {},
        });
      }

      await this.deps.eventService.emit({
        sessionId,
        type: 'SCM_FEEDBACK_SYNCED',
        payload: {
          pipelineFailures: publishResult.pipelineFailures,
          reviewComments: publishResult.reviewComments,
        },
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('orchestrator SCM publish failed', { 
        sessionId, 
        error: errorMessage 
      });

      await this.deps.eventService.emit({
        sessionId,
        type: 'SCM_PUBLISH_FAILED',
        payload: {
          error: errorMessage,
        },
      });
    }
  }

  /**
   * @param event TEST_FAILED event.
   * @returns Promise resolved after FIX dispatch.
   */
  private async handleTestFailed(event: EventRecord): Promise<void> {
    const session = await this.deps.sessionRepo.getById(event.sessionId);
    const workspaceId = this.extractWorkspaceId(session?.context);
    const scmWorkspace = this.extractScmWorkspace(session?.context);
    const cwd = scmWorkspace?.worktreeDir || await this.ensureSessionAgentDir(event.sessionId, workspaceId);
    const executionContext = this.buildExecutionContextPayload(session);
    const fixTask = await this.deps.taskService.createTask({
      sessionId: event.sessionId,
      type: TaskType.IMPLEMENT,
      title: 'Fix code after test failure',
      input: { failedTestTaskId: event.payload.taskId },
    });

    await this.deps.commandService.dispatch({
      sessionId: event.sessionId,
      type: 'FIX',
      payload: {
        taskId: fixTask.id,
        cwd,
        ...executionContext,
      },
    });
    this.log('orchestrator retrying workflow step: TESTING (fixing failures)', {
      sessionId: event.sessionId,
      taskId: fixTask.id,
    });
  }

  /**
   * @param event TEST_PASSED event.
   * @returns Promise resolved after REVIEW dispatch.
   */
  private async handleTestPassed(event: EventRecord): Promise<void> {
    // Only dispatch REVIEW if REVIEW step is in the workflow
    if (!this.isStepEnabled('REVIEW')) {
      this.log('orchestrator skipped REVIEW step (not in workflow)', {
        sessionId: event.sessionId,
      });

      // If PUBLISH is enabled, trigger it now.
      if (this.isStepEnabled('PUBLISH')) {
        await this.publishChanges(event.sessionId);
      }
      return;
    }

    const session = await this.deps.sessionRepo.getById(event.sessionId);
    const workspaceId = this.extractWorkspaceId(session?.context);
    const scmWorkspace = this.extractScmWorkspace(session?.context);
    const cwd = scmWorkspace?.worktreeDir || await this.ensureSessionAgentDir(event.sessionId, workspaceId);
    const executionContext = this.buildExecutionContextPayload(session);
    const reviewTask = await this.deps.taskService.createTask({
      sessionId: event.sessionId,
      type: TaskType.REVIEW,
      title: 'Review implemented changes',
      input: { testedTaskId: event.payload.taskId },
    });

    await this.deps.commandService.dispatch({
      sessionId: event.sessionId,
      type: 'REVIEW',
      payload: {
        taskId: reviewTask.id,
        cwd,
        ...executionContext,
      },
    });
    this.log('orchestrator started workflow step: REVIEW', { sessionId: event.sessionId, taskId: reviewTask.id });
  }

  /**
   * @param event REVIEW_COMPLETED event.
   * @returns Promise resolved after session completion updates.
   */
  private async handleReviewCompleted(event: EventRecord): Promise<void> {
    // Only trigger publish if PUBLISH step is in the workflow
    if (this.isStepEnabled('PUBLISH')) {
      await this.publishChanges(event.sessionId);
      return;
    }

    await this.deps.sessionRepo.update(event.sessionId, {
      status: SessionStatus.COMPLETED,
      updatedAt: Date.now(),
    });

    await this.deps.eventService.emit({
      sessionId: event.sessionId,
      type: 'SESSION_COMPLETED',
      payload: { reviewTaskId: event.payload.taskId },
    });
    this.log('orchestrator marked session completed (skipping publish)', { sessionId: event.sessionId });
  }

  /**
   * @param event REVIEW_FAILED event.
   * @returns Promise resolved after FIX dispatch.
   */
  private async handleReviewFailed(event: EventRecord): Promise<void> {
    const session = await this.deps.sessionRepo.getById(event.sessionId);
    const workspaceId = this.extractWorkspaceId(session?.context);
    const scmWorkspace = this.extractScmWorkspace(session?.context);
    const cwd = scmWorkspace?.worktreeDir || await this.ensureSessionAgentDir(event.sessionId, workspaceId);
    const executionContext = this.buildExecutionContextPayload(session);
    const fixTask = await this.deps.taskService.createTask({
      sessionId: event.sessionId,
      type: TaskType.IMPLEMENT,
      title: 'Fix code after review failure',
      input: {
        failedReviewTaskId: event.payload.taskId,
        findings: event.payload.findings,
      },
    });

    await this.deps.commandService.dispatch({
      sessionId: event.sessionId,
      type: 'FIX',
      payload: {
        taskId: fixTask.id,
        cwd,
        ...executionContext,
        reviewFindings: event.payload.findings,
      },
    });
    this.log('orchestrator retrying workflow step: REVIEW (fixing findings)', {
      sessionId: event.sessionId,
      taskId: fixTask.id,
    });
  }

  /**
   * @param event COMMAND_FAILED event.
   * @returns Promise resolved after session failure update.
   */
  private async handleCommandFailed(event: EventRecord): Promise<void> {
    await this.deps.sessionRepo.update(event.sessionId, {
      status: SessionStatus.FAILED,
      updatedAt: Date.now(),
    });
    this.log('orchestrator marked session failed (workflow step error)', { sessionId: event.sessionId });
  }

  /**
   * @param event SCM_PUBLISH_FAILED event.
   * @returns Promise resolved after session failure update.
   */
  private async handleScmPublishFailed(event: EventRecord): Promise<void> {
    await this.deps.sessionRepo.update(event.sessionId, {
      status: SessionStatus.FAILED,
      updatedAt: Date.now(),
    });
    this.log('orchestrator marked session failed (SCM publish error)', { 
      sessionId: event.sessionId,
      error: event.payload.error 
    });
  }

  private async handleScmPipelineFailed(event: EventRecord): Promise<void> {
    const session = await this.deps.sessionRepo.getById(event.sessionId);
    const workspaceId = this.extractWorkspaceId(session?.context);
    const scmWorkspace = this.extractScmWorkspace(session?.context);
    const cwd = scmWorkspace?.worktreeDir || await this.ensureSessionAgentDir(event.sessionId, workspaceId);
    const executionContext = this.buildExecutionContextPayload(session);
    await this.deps.sessionRepo.update(event.sessionId, {
      status: SessionStatus.RUNNING,
      updatedAt: Date.now(),
    });

    const fixTask = await this.deps.taskService.createTask({
      sessionId: event.sessionId,
      type: TaskType.IMPLEMENT,
      title: 'Fix code after SCM pipeline failure',
      input: {
        source: 'scm-webhook',
        failures: event.payload.failures,
        pullRequestNumber: event.payload.pullRequestNumber,
      },
    });

    await this.deps.commandService.dispatch({
      sessionId: event.sessionId,
      type: 'FIX',
      payload: {
        taskId: fixTask.id,
        cwd,
        ...executionContext,
        scmFailures: event.payload.failures,
      },
    });
    this.log('orchestrator handling workflow step: SCM_PIPELINE (fixing failures)', {
      sessionId: event.sessionId,
      taskId: fixTask.id,
    });
  }

  private async handleScmReviewCommentAdded(event: EventRecord): Promise<void> {
    const session = await this.deps.sessionRepo.getById(event.sessionId);
    const workspaceId = this.extractWorkspaceId(session?.context);
    const scmWorkspace = this.extractScmWorkspace(session?.context);
    const cwd = scmWorkspace?.worktreeDir || await this.ensureSessionAgentDir(event.sessionId, workspaceId);
    const executionContext = this.buildExecutionContextPayload(session);
    await this.deps.sessionRepo.update(event.sessionId, {
      status: SessionStatus.RUNNING,
      updatedAt: Date.now(),
    });

    const fixTask = await this.deps.taskService.createTask({
      sessionId: event.sessionId,
      type: TaskType.IMPLEMENT,
      title: 'Address SCM review comments',
      input: {
        source: 'scm-webhook',
        comments: event.payload.comments,
        pullRequestNumber: event.payload.pullRequestNumber,
      },
    });

    await this.deps.commandService.dispatch({
      sessionId: event.sessionId,
      type: 'FIX',
      payload: {
        taskId: fixTask.id,
        cwd,
        ...executionContext,
        scmReviewComments: event.payload.comments,
      },
    });
    this.log('orchestrator handling workflow step: SCM_REVIEW (addressing comments)', {
      sessionId: event.sessionId,
      taskId: fixTask.id,
    });
  }

  private async handleScmPipelinePassed(_event: EventRecord): Promise<void> {
    // Intentionally no-op for now.
  }

  private extractScmConfig(context?: SessionContext): ScmSessionConfig | null {
    const normalized = normalizeSessionContext(context);
    if (!normalized || typeof normalized !== 'object') {
      return null;
    }

    const rawScm = normalized.scm || normalized.repoUrl || normalized.repositoryUrl;
    if (!rawScm) {
      return null;
    }

    if (typeof rawScm === 'string') {
      const repoUrl = rawScm.trim();
      const provider = detectScmProvider(repoUrl);
      if (!repoUrl || !provider) {
        return null;
      }
      return {
        provider,
        repoUrl,
      };
    }

    const scm = this.asRecord(rawScm);
    if (!scm) {
      return null;
    }

    const repoUrl = this.extractRepoUrlFromScmRecord(scm);
    if (!repoUrl) {
      return null;
    }

    const explicitProvider =
      scm.provider === 'github' || scm.provider === 'azure-devops'
        ? (scm.provider as ScmSessionConfig['provider'])
        : undefined;
    const detectedProvider = detectScmProvider(repoUrl);
    const provider = explicitProvider || detectedProvider;
    if (!provider) {
      return null;
    }

    const config: ScmSessionConfig = {
      provider,
      repoUrl,
    };

    if (typeof scm.baseBranch === 'string' && scm.baseBranch.trim()) {
      config.baseBranch = scm.baseBranch;
    }
    if (typeof scm.token === 'string' && scm.token.trim()) {
      config.token = scm.token;
    }
    if (typeof scm.commitMessage === 'string' && scm.commitMessage.trim()) {
      config.commitMessage = scm.commitMessage;
    }
    if (typeof scm.prTitle === 'string' && scm.prTitle.trim()) {
      config.prTitle = scm.prTitle;
    }
    if (typeof scm.prDescription === 'string' && scm.prDescription.trim()) {
      config.prDescription = scm.prDescription;
    }

    return config;
  }

  private extractScmWorkspace(context?: SessionContext): ScmWorkspaceInfo | null {
    if (!context || typeof context !== 'object') {
      return null;
    }
    const scm = this.asRecord(normalizeSessionContext(context).scm);
    const workspace = this.asRecord(scm?.workspace);
    if (!workspace) {
      return null;
    }

    if (
      typeof workspace.rootDir !== 'string' ||
      typeof workspace.repoDir !== 'string' ||
      typeof workspace.worktreeDir !== 'string' ||
      typeof workspace.branch !== 'string' ||
      typeof workspace.baseBranch !== 'string'
    ) {
      return null;
    }

    return {
      rootDir: workspace.rootDir,
      repoDir: workspace.repoDir,
      worktreeDir: workspace.worktreeDir,
      branch: workspace.branch,
      baseBranch: workspace.baseBranch,
    };
  }

  private extractWorkspaceId(context?: SessionContext): string {
    const normalized = normalizeSessionContext(context);
    const metadata = this.asRecord(normalized.metadata);
    const candidate = typeof metadata?.workspaceId === 'string' ? metadata.workspaceId.trim() : '';
    return candidate || 'default';
  }

  private async ensureSessionAgentDir(sessionId: string, _workspaceId: string): Promise<string> {
    // Return session root so agents can access ao/, r/, and w/ directories
    const dir = path.join(
      this.deps.workspaceRootDir,
      this.sanitizePathPart(sessionId),
    );
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  private async ensureSessionOutputDir(sessionId: string, _workspaceId: string): Promise<string> {
    const dir = path.join(
      this.deps.workspaceRootDir,
      this.sanitizePathPart(sessionId),
      'ao',
    );
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  private sanitizePathPart(value: string): string {
    const clean = value.trim().replace(/[^a-zA-Z0-9._-]/g, '-');
    return clean || 'default';
  }

  private buildExecutionContextPayload(session?: Session | null): Record<string, unknown> {
    const normalized = normalizeSessionContext(session?.context);
    const requirements = this.asRecord(normalized.requirements) || {};
    const constraints = this.asRecord(normalized.constraints) || {};
    const metadata = this.asRecord(normalized.metadata) || {};
    return {
      userGoal: typeof session?.goal === 'string' ? session.goal : '',
      requirements,
      constraints,
      metadata,
      sessionContext: normalized,
    };
  }

  private async updateSessionScmContext(
    sessionId: string,
    currentContext: SessionContext,
    nextScmValue: SessionScmContext | Record<string, unknown>
  ): Promise<void> {
    const nextContext = normalizeSessionContext({
      ...normalizeSessionContext(currentContext),
      scm: nextScmValue,
    });
    await this.deps.sessionRepo.update(sessionId, {
      context: nextContext,
      updatedAt: Date.now(),
    });
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private extractRepoUrlFromScmRecord(scm: Record<string, unknown>): string {
    const candidates = [scm.repoUrl, scm.url, scm.repositoryUrl, scm.repo];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
    return '';
  }

  private async persistPlanFile(
    sessionId: string,
    planTaskId: string,
    planOutputDir?: string
  ): Promise<string | undefined> {
    if (!planTaskId || !planOutputDir) {
      return undefined;
    }

    const planTask = await this.deps.taskService.getById(planTaskId);
    const output = planTask?.output || {};
    const planText = this.extractPlanText(output);
    if (!planText.trim()) {
      this.log('orchestrator skipped plan file write: empty plan output', {
        sessionId,
        planTaskId,
        planOutputDir,
      });
      return undefined;
    }

    const planFilePath = path.join(planOutputDir, 'PLAN.md');
    await fs.writeFile(planFilePath, planText, 'utf8');
    this.log('orchestrator wrote plan file', {
      sessionId,
      planTaskId,
      planFilePath,
    });
    return planFilePath;
  }

  private extractPlanText(output: Record<string, unknown>): string {
    if (typeof output.plan === 'string' && output.plan.trim()) {
      return output.plan;
    }
    const execution = this.asRecord(output.execution);
    if (execution && typeof execution.stdout === 'string' && execution.stdout.trim()) {
      return execution.stdout;
    }
    return '';
  }

  /**
   * Completes a session by marking it as COMPLETED and emitting SESSION_COMPLETED event.
   * Used for early session completion based on workflow config.
   *
   * @param sessionId Session identifier.
   */
  private async completeSession(sessionId: string): Promise<void> {
    await this.deps.sessionRepo.update(sessionId, {
      status: SessionStatus.COMPLETED,
      updatedAt: Date.now(),
    });

    await this.deps.eventService.emit({
      sessionId,
      type: 'SESSION_COMPLETED',
      payload: {},
    });
  }

  private log(message: string, payload: Record<string, unknown>): void {
    if (!this.deps.logWorkflowProgress) {
      return;
    }
    this.deps.logger.info(message, payload);
  }
}
