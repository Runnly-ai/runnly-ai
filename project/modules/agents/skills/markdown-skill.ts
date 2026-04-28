import { CommandType } from '../../command';
import {
  AgentSkill,
  MarkdownSkillDefinition,
  SkillExecutionContext,
  SkillExecutionResult,
  SkillScriptCall,
  SkillScriptFn,
} from './types';
import fs from 'node:fs/promises';
import path from 'node:path';

const EVENT_BY_COMMAND: Record<CommandType, string> = {
  PLAN: 'PLAN_COMPLETED',
  GENERATE: 'IMPLEMENT_COMPLETED',
  FIX: 'IMPLEMENT_COMPLETED',
  VERIFY: 'TEST_PASSED',
  REVIEW: 'REVIEW_COMPLETED',
  REACT: 'REACT_COMPLETED',
};

/**
 * SKILL.md-backed skill implementation.
 */
export class MarkdownSkill implements AgentSkill {
  readonly id: string;
  private contentCache: string | null = null;
  private scriptsCache: Record<string, SkillScriptFn> | null = null;

  /**
   * @param definition Parsed SKILL.md definition.
   */
  constructor(private readonly definition: MarkdownSkillDefinition) {
    this.id = definition.id;
  }

  /**
   * Executes one skill invocation.
   */
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const { command, taskId, llmClient } = context;
    const defaultEvent = EVENT_BY_COMMAND[command.type] || 'COMMAND_COMPLETED';

    // Preserve existing test simulation behavior when command explicitly asks to fail.
    if (command.type === 'VERIFY' && Boolean(command.payload.shouldFail)) {
      return {
        taskStatus: 'FAILED',
        taskOutput: {
          skillId: this.id,
          skillPath: this.definition.sourcePath,
          reason: 'Simulated test failure',
        },
        eventType: 'TEST_FAILED',
        eventPayload: { taskId },
      };
    }

    if (!llmClient) {
      return {
        taskStatus: 'DONE',
        taskOutput: {
          skillId: this.id,
          skillTitle: this.definition.title,
          skillPath: this.definition.sourcePath,
          applied: true,
          note: 'Skill selected from metadata; no native LLM client configured.',
          description: this.definition.description,
        },
        eventType: defaultEvent,
        eventPayload: { taskId },
      };
    }

    const skillContent = await this.loadContent();
    const scripts = await this.loadScripts(context);
    const availableScripts = Object.keys(scripts);

    const response = await llmClient.generate({
      systemPrompt: 'You are an execution agent that follows SKILL.md instructions.',
      prompt: [
        `Skill source: ${this.definition.sourcePath}`,
        'Skill instructions:',
        skillContent,
        '',
        `Command type: ${command.type}`,
        `Command payload: ${JSON.stringify(command.payload)}`,
        '',
        availableScripts.length > 0
          ? `Available scripts: ${availableScripts.join(', ')}`
          : 'Available scripts: none',
        'If a script is needed, return JSON only in this exact shape: {"script":"<name>","args":{}}',
        'If no script is needed, return plain text final answer.',
      ].join('\n'),
      model: typeof command.payload.model === 'string' ? command.payload.model : undefined,
      metadata: {
        skillId: this.id,
        commandId: command.id,
        sessionId: command.sessionId,
      },
    });

    const scriptCall = this.parseScriptCall(response.text);
    if (scriptCall) {
      const fn = scripts[scriptCall.script];
      if (!fn) {
        throw new Error(
          `Requested script "${scriptCall.script}" is not available for skill "${this.id}".`
        );
      }
      const scriptResult = await fn(scriptCall.args || {}, context);
      return {
        taskStatus: 'DONE',
        taskOutput: {
          skillId: this.id,
          skillTitle: this.definition.title,
          skillPath: this.definition.sourcePath,
          applied: true,
          script: scriptCall.script,
          scriptArgs: scriptCall.args || {},
          scriptResult,
        },
        eventType: defaultEvent,
        eventPayload: { taskId },
      };
    }

    return {
      taskStatus: 'DONE',
      taskOutput: {
        skillId: this.id,
        skillTitle: this.definition.title,
        skillPath: this.definition.sourcePath,
        applied: true,
        result: response.text,
        data: response.data || {},
      },
      eventType: defaultEvent,
      eventPayload: { taskId },
    };
  }

  /**
   * Loads full SKILL.md content on-demand and caches it.
   */
  private async loadContent(): Promise<string> {
    if (this.contentCache !== null) {
      return this.contentCache;
    }
    this.contentCache = await fs.readFile(this.definition.sourcePath, 'utf8');
    return this.contentCache;
  }

  /**
   * Lazily loads optional script module from the skill directory.
   */
  private async loadScripts(context: SkillExecutionContext): Promise<Record<string, SkillScriptFn>> {
    if (this.scriptsCache !== null) {
      return this.scriptsCache;
    }

    const skillDir = path.dirname(this.definition.sourcePath);
    const candidates = ['script.js', 'script.cjs', 'script.ts'];

    for (const fileName of candidates) {
      const fullPath = path.join(skillDir, fileName);
      try {
        const stat = await fs.stat(fullPath);
        if (!stat.isFile()) {
          continue;
        }
        const imported = (await import(fullPath)) as {
          scripts?: Record<string, unknown>;
        };
        const rawScripts = imported.scripts || {};
        const scriptEntries = Object.entries(rawScripts).filter(
          (entry): entry is [string, SkillScriptFn] => typeof entry[1] === 'function'
        );
        this.scriptsCache = Object.fromEntries(scriptEntries);
        return this.scriptsCache;
      } catch (error: unknown) {
        const message = String(error);
        if (
          message.includes('ERR_MODULE_NOT_FOUND') ||
          message.includes('Cannot find module') ||
          message.includes('ENOENT')
        ) {
          continue;
        }
        context.agentContext.logger.error(
          `[skills] failed to load script module for ${this.definition.sourcePath}`,
          error
        );
        this.scriptsCache = {};
        return this.scriptsCache;
      }
    }

    this.scriptsCache = {};
    return this.scriptsCache;
  }

  /**
   * Parses JSON script-call payload from LLM output when present.
   */
  private parseScriptCall(raw: string): SkillScriptCall | null {
    const text = raw.trim();
    if (!text.startsWith('{') || !text.endsWith('}')) {
      return null;
    }
    try {
      const parsed = JSON.parse(text) as Partial<SkillScriptCall>;
      if (!parsed || typeof parsed.script !== 'string' || !parsed.script.trim()) {
        return null;
      }
      const args =
        parsed.args && typeof parsed.args === 'object' && !Array.isArray(parsed.args)
          ? (parsed.args as Record<string, unknown>)
          : {};
      return {
        script: parsed.script.trim(),
        args,
      };
    } catch {
      return null;
    }
  }
}
