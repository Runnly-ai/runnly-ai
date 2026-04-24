import { Command } from '../../command';
import { AgentContext } from '../agents/types/agent';

/**
 * Generic native-LLM client contract for skill execution.
 */
export interface LlmClient {
  /**
   * @param input LLM generation input payload.
   * @returns Model generation result.
   */
  generate(input: LlmGenerateInput): Promise<LlmGenerateResult>;
}

export interface LlmGenerateInput {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface LlmGenerateResult {
  text: string;
  data?: Record<string, unknown>;
}

/**
 * Execution context passed to a skill instance.
 */
export interface SkillExecutionContext {
  command: Command;
  taskId: string;
  agentContext: AgentContext;
  llmClient?: LlmClient;
}

/**
 * Call signature for optional skill-local scripts (e.g., script.ts/script.js).
 */
export type SkillScriptFn = (
  args: Record<string, unknown>,
  context: SkillExecutionContext
) => Promise<unknown> | unknown;

/**
 * JSON shape returned by the LLM when requesting script execution.
 */
export interface SkillScriptCall {
  script: string;
  args?: Record<string, unknown>;
}

/**
 * Normalized skill execution output consumed by the generic skill agent.
 */
export interface SkillExecutionResult {
  taskStatus: 'DONE' | 'FAILED';
  taskOutput: Record<string, unknown>;
  eventType: string;
  eventPayload?: Record<string, unknown>;
}

/**
 * Skill contract for command-type-driven execution.
 */
export interface AgentSkill {
  id: string;
  execute(context: SkillExecutionContext): Promise<SkillExecutionResult>;
}

/**
 * Lightweight metadata used for skill routing prompts.
 */
export interface SkillMetadata {
  id: string;
  title: string;
  description: string;
  sourcePath?: string;
}

/**
 * Lazy-load manifest for one skill module.
 */
export interface SkillManifest extends SkillMetadata {
  loader: () => Promise<AgentSkill>;
}

/**
 * Metadata for filesystem-backed SKILL.md entries.
 */
export interface MarkdownSkillDefinition {
  id: string;
  title: string;
  description: string;
  sourcePath: string;
}
