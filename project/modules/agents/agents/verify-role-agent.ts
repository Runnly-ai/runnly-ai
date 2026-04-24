import { Command } from '../../command';
import { AgentProviderRunResult } from './types/agent-provider';
import { AgentProviderRouter } from './providers/agent-provider-router';
import { RoleAgent } from './role-agent';

/**
 * Verify role agent for validation/test execution.
 */
export class VerifyRoleAgent extends RoleAgent {
  constructor(providerRouter: AgentProviderRouter, options: ConstructorParameters<typeof RoleAgent>[3]) {
    super('verify-agent', 'verify', providerRouter, options);
  }

  protected decide(command: Command, result: AgentProviderRunResult) {
    const taskId = String(command.payload.taskId || '');
    const verdict = this.parseVerdict(result.stdout);
    const failed = Boolean(command.payload.shouldFail) || verdict !== 'PASS';

    if (failed) {
      return {
        status: 'FAILED' as const,
        eventType: 'TEST_FAILED',
        taskOutput: {
          reason: this.extractFailureReason(result.stdout) || (verdict ? 'Verification failed' : 'Missing VERDICT: PASS|FAIL'),
          report: result.stdout,
        },
        eventPayload: {
          taskId,
          reason: this.extractFailureReason(result.stdout) || (verdict ? 'Verification failed' : 'Missing VERDICT: PASS|FAIL'),
          report: result.stdout,
        },
      };
    }

    return {
      status: 'DONE' as const,
      eventType: 'TEST_PASSED',
      taskOutput: {
        passed: true,
        report: result.stdout,
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
    // Prefer an explicit REASON: line if present.
    const match = text.match(/^\s*reason\s*:\s*(.+)\s*$/im);
    if (match?.[1]) return match[1].trim();
    // Fall back to first non-empty line after verdict.
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    const verdictIndex = lines.findIndex((line) => /^verdict\s*:\s*(pass|fail)\s*$/i.test(line));
    if (verdictIndex >= 0 && lines[verdictIndex + 1]) return lines[verdictIndex + 1];
    return '';
  }
}
