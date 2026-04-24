import { CliTaskRunner } from '../types/cli-agent';
import { AgentProvider, AgentProviderId, AgentProviderRunInput, AgentProviderRunResult } from '../types/agent-provider';

/**
 * CLI-backed provider adapter for codex/copilot runners.
 * CLI providers (codex/copilot) are already agentic - they have internal loops,
 * tools, and planning. We just pass clean user instructions.
 */
export class CliAgentProvider implements AgentProvider {
  constructor(
    public readonly id: AgentProviderId,
    private readonly runner: CliTaskRunner
  ) {}

  async run(input: AgentProviderRunInput): Promise<AgentProviderRunResult> {
    // Format clean instruction for CLI tool
    const instruction = this.formatInstruction(input);
    
    const result = await this.runner.run({
      instruction,
      cwd: input.cwd,
      model: input.model,
    });

    return {
      provider: this.id,
      command: result.command,
      cwd: result.cwd,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
  
  /**
   * Formats a clean instruction for CLI tools.
   * CLI tools don't need system prompts or structured messages - just the task.
   */
  private formatInstruction(input: AgentProviderRunInput): string {
    // Backward compatibility: use legacy instruction if provided
    if (input.instruction) {
      return input.instruction;
    }
    
    const parts: string[] = [];
    
    // Add task title if available
    if (input.taskTitle) {
      parts.push(`# Task: ${input.taskTitle}\n`);
    }
    
    // Main user request
    parts.push(input.userRequest);
    
    // Add task description if available
    if (input.taskDescription) {
      parts.push(`\n${input.taskDescription}`);
    }
    
    // Add project context (design, rules, etc)
    if (input.projectContext) {
      parts.push(`\n## Project Context\n${input.projectContext}`);
    }
    
    // Add previous output for iterations
    if (input.previousOutput) {
      parts.push(`\n## Previous Output\n${input.previousOutput}`);
    }
    
    return parts.join('\n');
  }
}
