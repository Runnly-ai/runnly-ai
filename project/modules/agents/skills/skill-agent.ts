import { Command } from '../../command';
import { Agent, AgentContext } from '../agents/types/agent';
import { SkillRegistry } from './skill-registry';
import { LlmClient, SkillMetadata } from './types';

interface SkillAgentOptions {
  llmClient?: LlmClient;
}

/**
 * Generic agent that routes commands to lazily loaded skills.
 */
export class SkillAgent extends Agent {
  /**
   * @param skillRegistry Lazy skill registry.
   * @param options Optional runtime options.
   */
  constructor(
    private readonly skillRegistry: SkillRegistry,
    private readonly options: SkillAgentOptions = {}
  ) {
    super('skill-agent', ['plan', 'test', 'review']);
  }

  /**
   * Executes command by delegating to the mapped skill.
   *
   * @param command Command to execute.
   * @param context Agent execution context.
   * @returns Promise resolved after task and event updates.
   */
  async execute(command: Command, context: AgentContext): Promise<void> {
    const taskId = String(command.payload.taskId || '');
    if (!taskId) {
      throw new Error(`Missing taskId for command ${command.id}`);
    }

    await context.taskService.markInProgress(taskId);
    const skill = await this.selectSkill(command);
    if (!skill) {
      throw new Error(`No skill available for command type ${command.type}`);
    }

    const result = await skill.execute({
      command,
      taskId,
      agentContext: context,
      llmClient: this.options.llmClient,
    });

    if (result.taskStatus === 'FAILED') {
      await context.taskService.markFailed(taskId, result.taskOutput);
    } else {
      await context.taskService.markDone(taskId, result.taskOutput);
    }

    await context.eventService.emit({
      sessionId: command.sessionId,
      type: result.eventType,
      payload: result.eventPayload || { taskId },
    });
  }

  /**
   * Selects a skill by explicit id override or metadata routing.
   */
  private async selectSkill(command: Command) {
    const candidates = this.skillRegistry.listCandidates();
    if (candidates.length === 0) {
      const allCandidates = this.skillRegistry.listAll();
      if (allCandidates.length === 0) {
        return null;
      }
      const chosen = await this.routeByMetadata(command, allCandidates);
      return this.skillRegistry.load(chosen.id);
    }

    const chosen = await this.routeByMetadata(command, candidates);
    return this.skillRegistry.load(chosen.id);
  }

  /**
   * Chooses one candidate using metadata-only routing.
   */
  private async routeByMetadata(command: Command, candidates: SkillMetadata[]): Promise<SkillMetadata> {
    if (!this.options.llmClient || candidates.length === 1) {
      return candidates[0];
    }

    const catalog = candidates
      .map((skill, idx) => `${idx + 1}. id=${skill.id}; name=${skill.title}; description=${skill.description}`)
      .join('\n');

    const response = await this.options.llmClient.generate({
      systemPrompt:
        'Select exactly one skill id from the provided catalog. Route based mainly on description (when-to-use). Return only the skill id.',
      prompt: [
        `Command type: ${command.type}`,
        `Command payload: ${JSON.stringify(command.payload)}`,
        '',
        'Skill catalog:',
        catalog,
      ].join('\n'),
      model: typeof command.payload.model === 'string' ? command.payload.model : undefined,
      metadata: {
        route: 'skill-selection',
        commandId: command.id,
      },
    });

    const selectedId = response.text.trim().split(/\s+/)[0];
    const matched = candidates.find((item) => item.id === selectedId);
    return matched || candidates[0];
  }
}
