import { Command } from '../../command';
import { Agent, AgentContext } from './types/agent';
import { AgentProviderId, AgentProviderRunResult, isAgentProviderId } from './types/agent-provider';
import { AgentProviderRouter } from './providers/agent-provider-router';

type RoleTaskStatus = 'DONE' | 'FAILED';

interface RoleAgentOptions {
  defaultProvider?: AgentProviderId;
  defaultModel?: string;
  defaultCwd: string;
  maxIterations?: number;
  defaultSkillContext?: string;
}

interface RoleExecutionDecision {
  status: RoleTaskStatus;
  eventType: string;
  taskOutput: Record<string, unknown>;
  eventPayload?: Record<string, unknown>;
}

/**
 * Simplified role-agent execution flow.
 * Agents prepare task context; providers handle prompts and execution strategy.
 */
export abstract class RoleAgent extends Agent {
  /**
   * @param id Agent id.
   * @param capability Routing capability.
   * @param providerRouter Provider router.
   * @param options Static role options.
   */
  constructor(
    id: string,
    capability: string,
    protected readonly providerRouter: AgentProviderRouter,
    protected readonly options: RoleAgentOptions
  ) {
    super(id, [capability]);
  }

  async execute(command: Command, context: AgentContext): Promise<void> {
    const taskId = String(command.payload.taskId || '');
    if (!taskId) {
      throw new Error(`Missing taskId for command ${command.id}`);
    }

    await context.taskService.markInProgress(taskId);
    const task = await context.taskService.getById(taskId);
    
    // Prepare clean input for provider - no prompt building here
    const input = {
      taskType: command.type,
      cwd: this.resolveCwd(command),
      workspaceRoot: context.workspaceRoot,
      model: this.resolveModel(command),
      
      // Task content - provider will format as needed
      userRequest: this.extractUserRequest(command),
      taskTitle: task?.title,
      taskDescription: this.extractTaskDescription(command),
      projectContext: this.extractProjectContext(command),
      skillContext: this.resolveSkillContext(command),
      requirements: this.extractRequirements(command),
      constraints: this.extractConstraints(command),
      
      maxIterations: this.resolveMaxIterations(command),
      enableTools: this.resolveEnableTools(command),
      
      sessionId: command.sessionId,
      commandId: command.id,
      taskId,
      agentRole: this.id,
    };

    const debugLogging = Boolean(context.agentDebugLogging);
    if (debugLogging) {
      context.logger.info('[role-agent] task execution started', {
        agentId: this.id,
        commandId: command.id,
        commandType: command.type,
        sessionId: command.sessionId,
        taskId,
        providerId: this.resolveProvider(command) || 'default',
        model: input.model || 'default',
        cwd: input.cwd,
        userRequestPreview: this.truncate(input.userRequest, 500),
        projectContextPreview: this.truncate(input.projectContext || '', 500),
      });
    }

    let result: AgentProviderRunResult;
    try {
      result = await this.providerRouter.run(this.resolveProvider(command), input);
    } catch (error: unknown) {
      context.logger.error('[role-agent] provider execution failed', {
        agentId: this.id,
        commandId: command.id,
        commandType: command.type,
        sessionId: command.sessionId,
        taskId,
        error: this.describeError(error),
      });
      throw error;
    }

    if (debugLogging) {
      context.logger.info('[role-agent] provider execution completed', {
        agentId: this.id,
        commandId: command.id,
        commandType: command.type,
        sessionId: command.sessionId,
        taskId,
        provider: result.provider,
        exitCode: result.exitCode,
        stdoutLength: result.stdout.length,
        stderrLength: result.stderr.length,
      });
      
      // Log the full CLI agent output for debugging
      context.logger.info('[role-agent] CLI agent final output', {
        agentId: this.id,
        commandId: command.id,
        taskId,
        provider: result.provider,
        stdout: result.stdout,
        stderr: result.stderr,
      });
    }

    const decision = this.decide(command, result);
    const taskOutput = {
      role: this.id,
      provider: result.provider,
      execution: this.toExecutionOutput(result),
      ...decision.taskOutput,
    };

    if (decision.status === 'FAILED') {
      await context.taskService.markFailed(taskId, taskOutput);
    } else {
      await context.taskService.markDone(taskId, taskOutput);
    }

    await context.eventService.emit({
      sessionId: command.sessionId,
      type: decision.eventType,
      payload: decision.eventPayload || { taskId },
    });

    if (debugLogging) {
      context.logger.info('[role-agent] task execution finished', {
        agentId: this.id,
        commandId: command.id,
        taskId,
        status: decision.status,
        eventType: decision.eventType,
      });
    }
  }

  protected abstract decide(command: Command, result: AgentProviderRunResult): RoleExecutionDecision;

  /**
   * Extracts the main user request/instruction from command payload.
   */
  protected extractUserRequest(command: Command): string {
    // Try instruction override first
    if (typeof command.payload.instruction === 'string') {
      return command.payload.instruction.trim();
    }
    
    // Then userGoal
    if (typeof command.payload.userGoal === 'string') {
      return command.payload.userGoal.trim();
    }
    
    // Fallback to full payload as JSON
    return JSON.stringify(command.payload);
  }

  /**
   * Extracts task description from payload.
   */
  protected extractTaskDescription(command: Command): string | undefined {
    if (typeof command.payload.description === 'string') {
      return command.payload.description.trim();
    }
    return undefined;
  }

  /**
   * Extracts project context (design, rules, etc) from payload.
   */
  protected extractProjectContext(command: Command): string | undefined {
    const parts: string[] = [];
    
    if (typeof command.payload.design === 'string' && command.payload.design.trim()) {
      parts.push(`## Design Guidelines\n${command.payload.design.trim()}`);
    }
    
    if (typeof command.payload.rules === 'string' && command.payload.rules.trim()) {
      parts.push(`## Coding Rules\n${command.payload.rules.trim()}`);
    }
    
    return parts.length > 0 ? parts.join('\n\n') : undefined;
  }

  /**
   * Extracts requirements from payload.
   */
  protected extractRequirements(command: Command): Record<string, unknown> | undefined {
    if (command.payload.requirements && typeof command.payload.requirements === 'object') {
      return command.payload.requirements as Record<string, unknown>;
    }
    return undefined;
  }

  /**
   * Extracts constraints from payload.
   */
  protected extractConstraints(command: Command): Record<string, unknown> | undefined {
    if (command.payload.constraints && typeof command.payload.constraints === 'object') {
      return command.payload.constraints as Record<string, unknown>;
    }
    return undefined;
  }

  /**
   * Resolves provider id from payload override, then falls back to role default.
   */
  protected resolveProvider(command: Command): AgentProviderId | undefined {
    const provider = typeof command.payload.provider === 'string' ? command.payload.provider.trim() : '';
    if (isAgentProviderId(provider)) {
      return provider;
    }
    return this.options.defaultProvider;
  }

  /**
   * Resolves model from payload override, then falls back to role default.
   */
  protected resolveModel(command: Command): string | undefined {
    const model = typeof command.payload.model === 'string' ? command.payload.model.trim() : '';
    return model || this.options.defaultModel;
  }

  protected resolveEnableTools(command: Command): boolean | undefined {
    if (typeof command.payload.enableTools === 'boolean') {
      return command.payload.enableTools;
    }
    return undefined;
  }

  protected resolveMaxIterations(command: Command): number | undefined {
    if (typeof command.payload.maxIterations === 'number') {
      return command.payload.maxIterations;
    }
    return this.options.maxIterations;
  }

  /**
   * Resolves command cwd from payload override, then falls back to role default.
   */
  protected resolveCwd(command: Command): string {
    const cwd = typeof command.payload.cwd === 'string' ? command.payload.cwd.trim() : '';
    return cwd || this.options.defaultCwd;
  }

  /**
   * Optional skill context for providers that can consume structured guidance.
   */
  protected resolveSkillContext(command: Command): string | undefined {
    const payloadSkillContext =
      typeof command.payload.skillContext === 'string' ? command.payload.skillContext.trim() : '';
    return payloadSkillContext || this.options.defaultSkillContext;
  }

  /**
   * Normalizes provider execution metadata for task output.
   */
  protected toExecutionOutput(result: AgentProviderRunResult): Record<string, unknown> {
    return {
      command: result.command,
      cwd: result.cwd,
      exitCode: result.exitCode,
      stdout: this.truncate(result.stdout),
      stderr: this.truncate(result.stderr),
    };
  }

  /**
   * Prevents oversized stdout/stderr blobs from polluting task state.
   */
  protected truncate(value: string, maxLen = 4000): string {
    if (value.length <= maxLen) {
      return value;
    }
    return `${value.slice(0, maxLen)}\n...truncated`;
  }

  protected describeError(error: unknown): Record<string, unknown> {
    if (!error || typeof error !== 'object') {
      return { message: String(error) };
    }

    const value = error as {
      message?: unknown;
      name?: unknown;
      stack?: unknown;
      status?: unknown;
      code?: unknown;
      type?: unknown;
      requestID?: unknown;
      error?: unknown;
    };
    const nested = value.error && typeof value.error === 'object'
      ? (value.error as Record<string, unknown>)
      : {};

    return {
      name: typeof value.name === 'string' ? value.name : undefined,
      message: typeof value.message === 'string' ? value.message : String(error),
      status: typeof value.status === 'number' ? value.status : undefined,
      code: typeof value.code === 'string' ? value.code : undefined,
      type: typeof value.type === 'string' ? value.type : undefined,
      requestId: typeof value.requestID === 'string' ? value.requestID : undefined,
      nestedCode: typeof nested.code === 'string' ? nested.code : undefined,
      nestedType: typeof nested.type === 'string' ? nested.type : undefined,
      nestedMessage: typeof nested.message === 'string' ? nested.message : undefined,
      failedGeneration:
        typeof nested.failed_generation === 'string'
          ? this.truncate(nested.failed_generation, 4000)
          : undefined,
      stack:
        typeof value.stack === 'string'
          ? this.truncate(value.stack, 4000)
          : undefined,
    };
  }
}
