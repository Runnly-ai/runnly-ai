import { Command } from '../../command';
import { AgentProviderRunResult } from './types/agent-provider';
import { AgentProviderRouter } from './providers/agent-provider-router';
import { RoleAgent } from './role-agent';

/**
 * Review role agent for quality review feedback.
 */
export class ReviewRoleAgent extends RoleAgent {
  constructor(providerRouter: AgentProviderRouter, options: ConstructorParameters<typeof RoleAgent>[3]) {
    super('review-agent', 'review', providerRouter, options);
  }

  protected decide(command: Command, result: AgentProviderRunResult) {
    const taskId = String(command.payload.taskId || '');
    const shouldFail =
      Boolean(command.payload.shouldFail) ||
      (Array.isArray(command.payload.reviewFindings) && command.payload.reviewFindings.length > 0);
    const verdict = this.parseVerdict(result.stdout);
    const failedByVerdict = verdict !== 'PASS';

    if (shouldFail || failedByVerdict) {
      return {
        status: 'FAILED' as const,
        eventType: 'REVIEW_FAILED',
        taskOutput: {
          reason: 'Review failed',
          findings:
            command.payload.reviewFindings ||
            this.extractFailureReason(result.stdout) ||
            (verdict ? result.stdout : 'Missing VERDICT: PASS|FAIL'),
        },
        eventPayload: {
          taskId,
          findings:
            command.payload.reviewFindings ||
            this.extractFailureReason(result.stdout) ||
            (verdict ? result.stdout : 'Missing VERDICT: PASS|FAIL'),
        },
      };
    }

    return {
      status: 'DONE' as const,
      eventType: 'REVIEW_COMPLETED',
      taskOutput: {
        reviewed: true,
        summary: result.stdout,
      },
      eventPayload: { taskId },
    };
  }

  private parseVerdict(text: string): 'PASS' | 'FAIL' | null {
    const match = text.match(/^\s*verdict\s*:\s*(pass|fail)\s*$/im);
    if (!match) return null;
    return match[1].toLowerCase() === 'fail' ? 'FAIL' : 'PASS';
  }

  private extractFailureReason(text: string): string {
    const match = text.match(/^\s*reason\s*:\s*(.+)\s*$/im);
    if (match?.[1]) return match[1].trim();
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    const verdictIndex = lines.findIndex((line) => /^verdict\s*:\s*(pass|fail)\s*$/i.test(line));
    if (verdictIndex >= 0 && lines[verdictIndex + 1]) return lines[verdictIndex + 1];
    return '';
  }
}
