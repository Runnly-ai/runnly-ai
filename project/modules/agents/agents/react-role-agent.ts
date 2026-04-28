import { Command } from '../../command';
import { AgentProviderRunResult } from './types/agent-provider';
import { AgentProviderRouter } from './providers/agent-provider-router';
import { RoleAgent } from './role-agent';

/**
 * ReAct role agent - combines reasoning and acting in iterative cycles.
 * Handles both planning and implementation in a single autonomous agent.
 */
export class ReActRoleAgent extends RoleAgent {
  constructor(providerRouter: AgentProviderRouter, options: ConstructorParameters<typeof RoleAgent>[3]) {
    super('react-agent', 'react', providerRouter, options);
  }

  protected decide(command: Command, result: AgentProviderRunResult) {
    const taskId = String(command.payload.taskId || '');
    const reactTrace = result.stdout;
    const changesSummary = this.extractChangesSummary(reactTrace);
    
    return {
      status: 'DONE' as const,
      eventType: 'REACT_COMPLETED',
      taskOutput: {
        reactTrace: reactTrace,               // Full ReAct trace with THOUGHT/ACTION/OBSERVATION
        changesSummary: changesSummary,        // Extracted changes for PR
        implementationFullOutput: reactTrace,
        provider: result.provider,
        exitCode: result.exitCode,
      },
      eventPayload: { taskId },
    };
  }

  /**
   * Extracts changes summary from ReAct trace or JSON completion block.
   */
  private extractChangesSummary(stdout: string): string {
    // Look for "## Summary" section in ReAct output
    const summaryMatch = /##\s*Summary\s*\n([\s\S]*?)(?=\n\{|\n##|$)/i.exec(stdout);
    if (summaryMatch && summaryMatch[1]) {
      return summaryMatch[1].trim();
    }
    
    // Try to extract from JSON completion block
    const jsonBlockMatch = /\n\s*\{[\s]*"done"[\s]*:/i.exec(stdout);
    if (jsonBlockMatch) {
      const contentBeforeJson = stdout.substring(0, jsonBlockMatch.index).trim();
      if (contentBeforeJson.length > 20) {
        return contentBeforeJson;
      }
    }
    
    // Fallback
    return 'ReAct agent completed. See full trace for details.';
  }
}
