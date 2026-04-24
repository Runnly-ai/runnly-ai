import { Command } from '../../command';
import { AgentContext } from './types/agent';
import { CliAgent, CliTaskRunner } from './types/cli-agent';

export interface CoderAgentOptions {
  defaultModel?: string;
  defaultCwd: string;
}

/**
 * Coder agent for GENERATE and FIX commands, backed by a CLI runner.
 */
export class CoderAgent extends CliAgent {
  /**
   * @param runner CLI task runner.
   * @param options Static runtime options.
   */
  constructor(
    runner: CliTaskRunner,
    private readonly options: CoderAgentOptions
  ) {
    super('coder', ['code'], runner);
  }

  /**
   * @param command Command to execute.
   * @param context Agent execution context.
   * @returns Promise resolved after CLI execution and event emission.
   */
  async execute(command: Command, context: AgentContext): Promise<void> {
    const taskId = String(command.payload.taskId || '');
    await context.taskService.markInProgress(taskId);

    try {
      const task = await context.taskService.getById(taskId);
      const instruction = this.buildInstruction(command, task?.title);
      const cwd = this.resolveCwd(command);
      const model = this.resolveModel(command);

      const result = await this.runner.run({ instruction, cwd, model });
      const taskOutput = {
        cli: {
          provider: result.provider,
          command: result.command,
          cwd: result.cwd,
          exitCode: result.exitCode,
          stdout: this.truncate(result.stdout),
          stderr: this.truncate(result.stderr),
        },
      };

      if (command.type === 'FIX') {
        await context.taskService.markDone(taskId, { ...taskOutput, fixApplied: true });
      } else {
        await context.taskService.markDone(taskId, { ...taskOutput, implementationApplied: true });
      }

      await context.eventService.emit({
        sessionId: command.sessionId,
        type: 'IMPLEMENT_COMPLETED',
        payload: { taskId },
      });
    } catch (error: unknown) {
      await context.taskService.markFailed(taskId, { reason: String(error) });
      throw error;
    }
  }

  private buildInstruction(command: Command, taskTitle?: string): string {
    const payloadInstruction =
      typeof command.payload.instruction === 'string' ? command.payload.instruction.trim() : '';
    if (payloadInstruction) {
      return payloadInstruction;
    }

    const payloadContext = JSON.stringify(command.payload);
    if (command.type === 'FIX') {
      return [
        'Fix the codebase based on failing checks and make tests pass.',
        taskTitle ? `Task title: ${taskTitle}` : '',
        `Context payload: ${payloadContext}`,
      ]
        .filter(Boolean)
        .join('\n');
    }

    return [
      'Implement the planned code task in the repository.',
      taskTitle ? `Task title: ${taskTitle}` : '',
      `Context payload: ${payloadContext}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private resolveCwd(command: Command): string {
    const commandCwd = typeof command.payload.cwd === 'string' ? command.payload.cwd.trim() : '';
    return commandCwd || this.options.defaultCwd;
  }

  private resolveModel(command: Command): string | undefined {
    const commandModel = typeof command.payload.model === 'string' ? command.payload.model.trim() : '';
    return commandModel || this.options.defaultModel;
  }

  private truncate(value: string, maxLen = 4000): string {
    if (value.length <= maxLen) {
      return value;
    }
    return `${value.slice(0, maxLen)}\n...truncated`;
  }
}
