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
    const changesSummary = this.extractChangesSummary(result.stdout);
    
    return {
      status: 'DONE' as const,
      eventType: 'IMPLEMENT_COMPLETED',
      taskOutput: {
        implementationSummary: result.stdout,  // Full output (includes JSON block)
        changesSummary: changesSummary,        // Extracted content before JSON
        implementationFullOutput: result.stdout,
        provider: result.provider,
        exitCode: result.exitCode,
      },
      eventPayload: { taskId },
    };
  }

  /**
   * Extracts implementation summary content from agent output.
   * Follows planning agent pattern: extract markdown content BEFORE JSON completion block.
   * This will be used in PR description and GENERATE.md.
   */
  private extractChangesSummary(stdout: string): string {
    // Strategy 1: Extract everything before JSON completion block (like planning agent)
    // Look for the JSON block with "done" field
    const jsonBlockMatch = /\n\s*\{[\s]*"done"[\s]*:/i.exec(stdout);
    if (jsonBlockMatch) {
      const contentBeforeJson = stdout.substring(0, jsonBlockMatch.index).trim();
      if (contentBeforeJson.length > 20) {
        return contentBeforeJson;
      }
    }
    
    // Strategy 2: Look for common heading patterns if no JSON block found
    const patterns = [
      /(?:^|\n)(?:###?\s*)?(?:What\s+I\s+(?:changed|did|implemented))[:\s]*\n([\s\S]*?)(?=\n(?:###?|Note:|$))/i,
      /(?:^|\n)(?:###?\s*)?(?:What\s+(?:changed|was\s+done))[:\s]*\n([\s\S]*?)(?=\n(?:###?|Note:|$))/i,
      /(?:^|\n)(?:###?\s*)?(?:Changes|Implementation|Summary)[:\s]*\n([\s\S]*?)(?=\n(?:###?|Note:|$))/i,
      /(?:^|\n)(?:Implemented:?\s*)([\s\S]*?)(?=\n(?:###?|Note:|$))/i,
    ];
    
    for (const pattern of patterns) {
      const match = pattern.exec(stdout);
      if (match && match[1] && match[1].trim().length > 20) {
        return match[1].trim();
      }
    }
    
    // Strategy 3: Fallback to first substantial paragraph
    const firstParagraph = stdout.trim().split('\n\n')[0];
    if (firstParagraph && firstParagraph.length > 20) {
      return firstParagraph;
    }
    
    return 'Implementation completed. See full output for details.';
  }
}
