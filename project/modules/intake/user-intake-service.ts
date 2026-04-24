import { SessionService, SessionView } from '../session';
import { UserIntakeAgent } from './user-intake-agent';
import { StartSessionRequest, StructuredRequestResult, TaskValidationIssue } from './types';
import { TaskValidationTool } from './task-validation-tool';
import { TaskValidationSchema } from './task-validation-schema';
import { Logger } from '../utils/logger';
import { intakeMessages } from './messages';

interface PendingTaskDraft {
  request: StartSessionRequest;
  missing: TaskValidationIssue[];
  askIndex: number;
  updatedAt: number;
}

/**
 * Executes structured user requests using existing session services.
 */
export class UserIntakeService {
  private readonly pendingByThreadId = new Map<string, PendingTaskDraft>();
  private readonly workspaceByThreadId = new Map<string, string>();
  private readonly validationTool: TaskValidationTool;

  constructor(
    private readonly sessionService: SessionService,
    private readonly intakeAgent: UserIntakeAgent,
    validationSchema: TaskValidationSchema,
    private readonly logger: Logger,
  ) {
    this.validationTool = new TaskValidationTool(validationSchema);
  }

  async handleMessage(
    message: string,
    threadId?: string,
    contextPatch?: Record<string, unknown>,
  ): Promise<StructuredRequestResult> {
    const key = this.normalizeThreadKey(threadId);
    const pending = this.pendingByThreadId.get(key);
    if (pending) {
      this.log('intake continuing pending task draft', {
        threadId: key,
        missingFields: pending.missing.map((item) => item.field),
      });
      const updated = this.applyPendingAnswer(pending, message);
      const validation = this.validationTool.run({ request: updated.request });
      this.logValidation('intake validation result (pending)', validation, key);
      if (!validation.isValid) {
        const refreshed: PendingTaskDraft = {
          request: validation.normalizedRequest,
          missing: validation.missing,
          askIndex: 0,
          updatedAt: Date.now(),
        };
        this.pendingByThreadId.set(key, refreshed);
        return this.buildNeedsInfoResult(refreshed, intakeMessages.needsInfoFollowup);
      }

      this.pendingByThreadId.delete(key);
      return this.executeStartSession(validation.normalizedRequest, key, threadId, contextPatch);
    }

    const request = await this.intakeAgent.parse(message);
    this.log('intake converted user message to structured request', {
      threadId: key,
      action: request.action,
      confidence: request.confidence,
      rawMessage: request.rawMessage,
      ...(request.action === 'START_SESSION' ? {
        goal: request.goal,
        autoStart: request.autoStart,
        context: request.context,
      } : {}),
      ...(request.action === 'GET_SESSION' || request.action === 'GET_EVENTS' ? {
        sessionId: request.sessionId,
      } : {}),
      ...(request.action === 'CONVERSE' ? { replyPreview: request.reply.slice(0, 180) } : {}),
    });

    if (request.action === 'CONVERSE') {
      return {
        kind: 'conversation',
        request,
        summary: intakeMessages.conversationReplyOnly,
        reply: request.reply,
      };
    }

    if (request.action === 'START_SESSION') {
      const validation = this.validationTool.run({ request });
      this.logValidation('intake validation result (initial)', validation, key);
      if (!validation.isValid) {
        const draft: PendingTaskDraft = {
          request: validation.normalizedRequest,
          missing: validation.missing,
          askIndex: 0,
          updatedAt: Date.now(),
        };
        this.pendingByThreadId.set(key, draft);
        return this.buildNeedsInfoResult(
          draft,
          intakeMessages.needsInfoInitial,
        );
      }
      return this.executeStartSession(validation.normalizedRequest, key, threadId, contextPatch);
    }

    if (request.action === 'GET_SESSION') {
      const view = await this.requireSessionView(request.sessionId);
      const events = await this.sessionService.getEvents(request.sessionId);
      return {
        kind: 'task',
        request,
        sessionId: request.sessionId,
        status: view.status,
        currentStep: view.currentStep,
        progress: view.progress,
        summary: intakeMessages.loadedSession(request.sessionId),
        events,
        view,
      };
    }

    if (request.action === 'GET_EVENTS') {
      const view = await this.requireSessionView(request.sessionId);
      const events = await this.sessionService.getEvents(request.sessionId);
      return {
        kind: 'task',
        request,
        sessionId: request.sessionId,
        status: view.status,
        currentStep: view.currentStep,
        progress: view.progress,
        summary: intakeMessages.loadedEvents(request.sessionId, events.length),
        events,
        view,
      };
    }
    throw new Error(`Unsupported intake action: ${(request as { action?: string }).action || 'unknown'}`);
  }

  private async requireSessionView(sessionId: string): Promise<SessionView> {
    const view = await this.sessionService.getSessionView(sessionId);
    if (!view) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return view;
  }

  private normalizeThreadKey(threadId?: string): string {
    const clean = typeof threadId === 'string' ? threadId.trim() : '';
    if (!clean) {
      return 'default';
    }

    const mapped = this.workspaceByThreadId.get(clean);
    if (mapped) {
      return mapped;
    }

    if (/^local_[a-zA-Z0-9._-]+$/.test(clean)) {
      return clean;
    }

    // Session ids are not stable workspace ids.
    if (/^sess_[a-zA-Z0-9._-]+$/.test(clean)) {
      return 'default';
    }

    return clean;
  }

  private applyPendingAnswer(draft: PendingTaskDraft, message: string): PendingTaskDraft {
    const answer = message.trim();
    if (!answer) {
      return draft;
    }
    const currentIssue = draft.missing[draft.askIndex] || draft.missing[0];
    if (!currentIssue) {
      return draft;
    }
    const request = this.validationTool.applyUserAnswer(draft.request, currentIssue.field, answer);
    this.log('intake applied user answer to pending field', {
      field: currentIssue.field,
      answerPreview: answer.slice(0, 180),
    });
    return {
      ...draft,
      request,
      updatedAt: Date.now(),
    };
  }

  private buildNeedsInfoResult(draft: PendingTaskDraft, summary: string): StructuredRequestResult {
    const currentIssue = draft.missing[draft.askIndex] || draft.missing[0];
    const question = currentIssue ? currentIssue.question : 'Please provide the missing high-level task information.';
    return {
      kind: 'task_needs_info',
      request: draft.request,
      summary,
      questions: [question],
      missing: draft.missing,
    };
  }

  private async executeStartSession(
    request: StartSessionRequest,
    workspaceId: string,
    sourceThreadId?: string,
    contextPatch?: Record<string, unknown>,
  ): Promise<StructuredRequestResult> {
    const context = this.withWorkspaceIdAndPatch(
      request.context as Record<string, unknown> | undefined,
      workspaceId,
      contextPatch,
    );
    const created = await this.sessionService.createSession(request.goal, context);
    this.workspaceByThreadId.set(created.id, workspaceId);
    const sourceKey = typeof sourceThreadId === 'string' ? sourceThreadId.trim() : '';
    if (sourceKey) {
      this.workspaceByThreadId.set(sourceKey, workspaceId);
    }
    this.log('intake created session after successful validation', {
      sessionId: created.id,
      goal: request.goal,
      context,
    });
    if (!request.autoStart) {
      const view = await this.requireSessionView(created.id);
      const events = await this.sessionService.getEvents(created.id);
      return {
        kind: 'task',
        request,
        sessionId: created.id,
        status: view.status,
        currentStep: view.currentStep,
        progress: view.progress,
        summary: intakeMessages.createdSessionNoStart(created.id),
        events,
        view,
      };
    }

    const started = await this.sessionService.startSession(created.id);
    if (!started) {
      throw new Error('Failed to auto-start session.');
    }
    const view = await this.requireSessionView(created.id);
    const events = await this.sessionService.getEvents(created.id);
    this.log('intake handed off validated task to orchestration', {
      sessionId: created.id,
      status: view.status,
      currentStep: view.currentStep,
      progress: view.progress,
    });
    return {
      kind: 'task',
      request,
      sessionId: created.id,
      status: view.status,
      currentStep: view.currentStep,
      progress: view.progress,
      summary: intakeMessages.startedSession(created.id),
      events,
      view,
    };
  }

  private logValidation(
    message: string,
    validation: { isValid: boolean; missing: TaskValidationIssue[]; normalizedRequest: StartSessionRequest },
    threadId: string,
  ): void {
    this.log(message, {
      threadId,
      isValid: validation.isValid,
      missing: validation.missing,
      normalizedGoal: validation.normalizedRequest.goal,
      normalizedContext: validation.normalizedRequest.context,
    });
  }

  private log(message: string, payload: Record<string, unknown>): void {
    this.logger.info(message, payload);
  }

  private withWorkspaceIdAndPatch(
    context: Record<string, unknown> | undefined,
    workspaceId: string,
    contextPatch?: Record<string, unknown>,
  ): Record<string, unknown> {
    const base = context && typeof context === 'object' && !Array.isArray(context) ? { ...context } : {};
    const metadata =
      base.metadata && typeof base.metadata === 'object' && !Array.isArray(base.metadata)
        ? { ...(base.metadata as Record<string, unknown>) }
        : {};
    metadata.workspaceId = workspaceId || 'default';
    if (contextPatch && typeof contextPatch === 'object') {
      for (const [key, value] of Object.entries(contextPatch)) {
        if (key === 'metadata' && value && typeof value === 'object' && !Array.isArray(value)) {
          Object.assign(metadata, value as Record<string, unknown>);
          continue;
        }
        base[key] = value;
      }
    }
    return {
      ...base,
      metadata,
    };
  }
}
