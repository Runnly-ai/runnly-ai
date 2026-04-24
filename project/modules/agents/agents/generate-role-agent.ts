import { Command } from '../../command';
import { AgentProviderRunResult } from './types/agent-provider';
import { AgentProviderRouter } from './providers/agent-provider-router';
import { RoleAgent } from './role-agent';

/**
 * Generate role agent for implementation/fix steps.
 */
export class GenerateRoleAgent extends RoleAgent {
  constructor(providerRouter: AgentProviderRouter, options: ConstructorParameters<typeof RoleAgent>[3]) {
    super('generate-agent', 'generate', providerRouter, options);
  }

  protected decide(command: Command, result: AgentProviderRunResult) {
    const taskId = String(command.payload.taskId || '');
    const summary = this.extractImplementationSummary(result);
    
    return {
      status: 'DONE' as const,
      eventType: 'IMPLEMENT_COMPLETED',
      taskOutput: {
        implementationSummary: summary,
        implementationFullOutput: result.stdout,  // Keep full output for debugging
        provider: result.provider,
        exitCode: result.exitCode,
      },
      eventPayload: { taskId },
    };
  }

  /**
   * Extracts implementation summary from agent output.
   * Tries multiple strategies to get clean, actionable output.
   */
  private extractImplementationSummary(result: AgentProviderRunResult): string {
    const stdout = result.stdout;
    
    // Strategy 1: Extract completion control block (if present)
    const completionBlock = this.extractCompletionBlock(stdout);
    if (completionBlock) {
      return [
        `Status: ${completionBlock.done ? 'Complete' : 'Incomplete'}`,
        completionBlock.summary ? `Summary: ${completionBlock.summary}` : '',
        completionBlock.output || '',
      ].filter(Boolean).join('\n\n');
    }
    
    // Strategy 2: For CLI agents (Codex), extract response from known format
    if (result.provider === 'codex' || result.provider === 'copilot') {
      const cleanResponse = this.extractCliResponse(stdout);
      if (cleanResponse !== stdout) {
        return cleanResponse;
      }
    }
    
    // Strategy 3: Fallback to full stdout (for LLM agents or when parsing fails)
    return stdout;
  }

  /**
   * Extracts completion control block from output.
   * Format: {"done": true/false, "summary": "...", "output": "..."}
   */
  private extractCompletionBlock(stdout: string): { done: boolean; summary?: string; output?: string } | null {
    try {
      // Look for JSON block with "done" field
      const jsonMatch = /\{[\s]*"done"[\s]*:[\s]*(true|false)[\s\S]*?\}/g.exec(stdout);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (typeof parsed.done === 'boolean') {
          return parsed;
        }
      }
    } catch {
      // JSON parsing failed, continue to next strategy
    }
    return null;
  }

  /**
   * Extracts clean response from CLI tool output (Codex/Copilot).
   * Removes metadata headers and footers.
   */
  private extractCliResponse(stdout: string): string {
    // Pattern: Extract content between "codex\n" and "\ntokens used"
    const cliResponseMatch = /\n(?:codex|copilot)\n([\s\S]*?)\n(?:tokens used|session)/i.exec(stdout);
    if (cliResponseMatch && cliResponseMatch[1]) {
      return cliResponseMatch[1].trim();
    }
    
    // Fallback: Remove common metadata lines
    const lines = stdout.split('\n');
    const filtered = lines.filter(line => {
      const lower = line.toLowerCase();
      return !lower.startsWith('reading prompt') &&
             !lower.includes('research preview') &&
             !lower.startsWith('workdir:') &&
             !lower.startsWith('model:') &&
             !lower.startsWith('provider:') &&
             !lower.startsWith('session id:') &&
             !lower.startsWith('tokens used') &&
             line !== '--------';
    });
    
    return filtered.join('\n').trim() || stdout;
  }
}
