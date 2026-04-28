import { Command } from '../../command';
import { Agent, AgentContext } from './types/agent';
import { AgentProviderId, AgentProviderRunResult, isAgentProviderId } from './types/agent-provider';
import { AgentProviderRouter } from './providers/agent-provider-router';
import { createDefaultSkillRegistry } from '../skills/default-skill-registry';
import { SkillMetadata } from '../skills/types';
import { nowTs } from '../../utils/time';

type RoleTaskStatus = 'DONE' | 'FAILED';

interface RoleAgentOptions {
  defaultProvider?: AgentProviderId;
  defaultModel?: string;
  defaultCwd: string;
  maxIterations?: number;
  defaultSkillContext?: string;
  skillsDir?: string;
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
    const skillContext = await this.resolveSkillContextWithRegistry(command, context);
    const skillReminders = await this.buildSkillReminders(command, context);
    
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
      skillContext: [skillReminders, skillContext].filter(Boolean).join('\n\n') || undefined,
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
      invokedSkills: await this.resolveAndPersistInvokedSkills(command, context, skillContext),
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
   * Loads configured filesystem skills and summarizes them into provider context.
   */
  protected async resolveSkillContextWithRegistry(command: Command, context: AgentContext): Promise<string | undefined> {
    const payloadSkillContext = this.resolveSkillContext(command);
    const skillsDir = this.options.skillsDir || process.env.AGENT_SKILLS_DIR || '';
    if (!skillsDir.trim()) {
      return payloadSkillContext;
    }

    try {
      const registry = await createDefaultSkillRegistry({
        skillsDir,
        logger: context.logger,
      });
      const skills = registry.listCandidates();
      if (skills.length === 0) {
        return payloadSkillContext;
      }

      const summary = this.formatSkillSummary(skills);
      return payloadSkillContext ? `${payloadSkillContext}\n\n${summary}` : summary;
    } catch (error: unknown) {
      context.logger.error('[role-agent] failed to load skills context', error);
      return payloadSkillContext;
    }
  }

  protected formatSkillSummary(skills: SkillMetadata[]): string {
    const lines = skills.map((skill) => {
      const toolText = skill.tools?.length ? ` tools=${skill.tools.join(',')}` : '';
      const dependencyText = skill.skills?.length ? ` skills=${skill.skills.join(',')}` : '';
      const isolationText = skill.isolation ? ` isolation=${skill.isolation}` : '';
      return `- ${skill.id}: ${skill.title} — ${skill.description}${toolText}${dependencyText}${isolationText}`;
    });
    return [
      '## Available Skills',
      'The following skills are available from the configured skill root(s). Use them when they match the task.',
      '',
      ...lines,
    ].join('\n');
  }

  protected extractInvokedSkills(skillContext?: string): string[] {
    if (!skillContext) {
      return [];
    }
    const matches = skillContext.match(/^[a-z0-9-_/.]+/gim) || [];
    return Array.from(new Set(matches.map((item) => item.trim()).filter(Boolean)));
  }

  protected async resolveAndPersistInvokedSkills(
    command: Command,
    context: AgentContext,
    skillContext?: string
  ): Promise<string[]> {
    const invoked = this.extractInvokedSkills(skillContext);
    const persisted = await this.loadPersistedInvokedSkills(command.sessionId, context);
    const merged = Array.from(new Set([...persisted, ...invoked]));

    await this.persistInvokedSkills(command.sessionId, context, merged, command.id);
    return merged;
  }

  protected async loadPersistedInvokedSkills(sessionId: string, context: AgentContext): Promise<string[]> {
    const sessionRepo = context.sessionRepo;
    if (!sessionRepo) {
      return [];
    }
    const session = await sessionRepo.getById(sessionId);
    const raw = session?.context?.metadata?.invokedSkills;
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
  }

  protected async persistInvokedSkills(
    sessionId: string,
    context: AgentContext,
    invokedSkills: string[],
    commandId: string
  ): Promise<void> {
    const sessionRepo = context.sessionRepo;
    if (!sessionRepo) {
      return;
    }

    const session = await sessionRepo.getById(sessionId);
    if (!session) {
      return;
    }

    const sessionContext = session.context && typeof session.context === 'object' ? { ...session.context } : {};
    const metadata = sessionContext.metadata && typeof sessionContext.metadata === 'object'
      ? { ...sessionContext.metadata }
      : {};

    metadata.invokedSkills = invokedSkills;
    metadata.lastSkillInvocation = {
      commandId,
      agentId: this.id,
      updatedAt: nowTs(),
    };
    sessionContext.metadata = metadata;

    await sessionRepo.update(sessionId, {
      context: sessionContext,
      updatedAt: nowTs(),
    });
  }

  protected async buildSkillReminders(command: Command, context: AgentContext): Promise<string | undefined> {
    const skillsDir = this.options.skillsDir || process.env.AGENT_SKILLS_DIR || '';
    if (!skillsDir.trim()) {
      const invokedSkills = await this.loadPersistedInvokedSkills(command.sessionId, context);
      return invokedSkills.length > 0
        ? [
            '## Invoked Skills',
            'The following skills were previously invoked in this session and should remain active:',
            ...invokedSkills.map((skillId) => `- ${skillId}`),
          ].join('\n')
        : undefined;
    }

    try {
      const registry = await createDefaultSkillRegistry({
        skillsDir,
        logger: context.logger,
      });
      const candidates = registry.listCandidates();
      if (candidates.length === 0) {
        return undefined;
      }

      const query = `${command.type} ${JSON.stringify(command.payload)} ${this.resolveSkillContext(command) || ''}`;
      const scored = candidates
        .map((skill) => {
          const haystack = `${skill.id} ${skill.title} ${skill.description} ${(skill.tools || []).join(' ')} ${(skill.skills || []).join(' ')}`.toLowerCase();
          const tokens = query.toLowerCase().split(/[^a-z0-9-_/.]+/).filter(Boolean);
          const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
          return { skill, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((item) => item.skill);

      const invokedSkills = await this.loadPersistedInvokedSkills(command.sessionId, context);
      const sections: string[] = [];

      if (invokedSkills.length > 0) {
        sections.push([
          '## Invoked Skills',
          'The following skills were previously invoked in this session and should remain active:',
          ...invokedSkills.map((skillId) => `- ${skillId}`),
        ].join('\n'));
      }

      if (scored.length > 0) {
        sections.push([
          '## Skills relevant to your task',
          'The following skills were matched from the configured skill roots for this turn:',
          ...scored.map((skill) => `- ${skill.id}: ${skill.title} — ${skill.description}`),
        ].join('\n'));
      }

      return sections.length > 0 ? sections.join('\n\n') : undefined;
    } catch (error: unknown) {
      context.logger.error('[role-agent] failed to build skill reminders', error);
      return undefined;
    }
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
