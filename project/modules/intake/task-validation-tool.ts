import { normalizeSessionContext, SessionContext } from '../session';
import { StartSessionRequest, TaskValidationIssue } from './types';
import { TaskValidationSchema } from './task-validation-schema';

export interface TaskValidationToolInput {
  request: StartSessionRequest;
}

export interface TaskValidationToolResult {
  isValid: boolean;
  normalizedRequest: StartSessionRequest;
  missing: TaskValidationIssue[];
}

/**
 * Tool-like validator that enforces high-level intake requirements.
 * This intentionally avoids implementation details and focuses on:
 * - objective (what outcome)
 * - scope (where it applies)
 * - success criteria (how done is measured)
 */
export class TaskValidationTool {
  constructor(private readonly schema: TaskValidationSchema) {}

  run(input: TaskValidationToolInput): TaskValidationToolResult {
    const normalizedRequest = this.normalizeRequest(input.request);
    const missing = this.collectMissingFields(normalizedRequest);
    return {
      isValid: missing.length === 0,
      normalizedRequest,
      missing,
    };
  }

  applyUserAnswer(request: StartSessionRequest, field: string, answer: string): StartSessionRequest {
    const value = answer.trim();
    if (!value) {
      return request;
    }
    return this.setPathValue(request, field, value);
  }

  private normalizeRequest(request: StartSessionRequest): StartSessionRequest {
    const goal = request.goal.trim();
    const context = normalizeSessionContext(request.context || {});
    const normalizedContext: SessionContext = { ...context };

    for (const field of this.schema.requiredFields) {
      if (!field.seedFromGoal || !goal) {
        continue;
      }
      const existing = this.getPathValue({ ...request, context: normalizedContext }, field.path);
      if (!this.clean(existing)) {
        this.applyPathToContext(normalizedContext, field.path, goal);
      }
    }

    return {
      ...request,
      goal,
      context: normalizedContext,
    };
  }

  private collectMissingFields(request: StartSessionRequest): TaskValidationIssue[] {
    const missing: TaskValidationIssue[] = [];

    for (const field of this.schema.requiredFields) {
      if (!field.required) {
        continue;
      }
      const value = this.getPathValue(request, field.path);
      if (this.clean(value)) {
        continue;
      }
      missing.push({
        field: field.path,
        reason: field.reason,
        question: field.question,
      });
    }

    return missing;
  }

  private setPathValue(request: StartSessionRequest, path: string, value: string): StartSessionRequest {
    if (path === 'goal') {
      return { ...request, goal: value };
    }

    const context = normalizeSessionContext(request.context || {});
    this.applyPathToContext(context, path, value);
    return {
      ...request,
      context,
    };
  }

  private getPathValue(request: StartSessionRequest, path: string): unknown {
    if (path === 'goal') {
      return request.goal;
    }
    const context = normalizeSessionContext(request.context || {});
    const segments = path.split('.').filter(Boolean);
    let current: unknown = context;
    for (const segment of segments) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  private applyPathToContext(context: SessionContext, path: string, value: string): void {
    const segments = path.split('.').filter(Boolean);
    if (segments.length === 0) {
      return;
    }

    let cursor: Record<string, unknown> = context as Record<string, unknown>;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const key = segments[i];
      const next = cursor[key];
      if (!next || typeof next !== 'object' || Array.isArray(next)) {
        cursor[key] = {};
      }
      cursor = cursor[key] as Record<string, unknown>;
    }
    cursor[segments[segments.length - 1]] = value;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private clean(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }
}
