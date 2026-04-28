import { Command } from '../../command';
import { AgentContext } from '../agents/types/agent';
import { AgentToolCall, AgentToolSpec } from '../tools';

export interface LlmClient {
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

export type SkillIsolationMode = 'inline' | 'subagent';

export interface SkillFrontmatter {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  tools?: string[];
  disallowedTools?: string[];
  skills?: string[];
  model?: string;
  memory?: string;
  hooks?: string[];
  isolation?: SkillIsolationMode;
}

export interface SkillDocument {
  sourcePath: string;
  frontmatter: SkillFrontmatter;
  body: string;
}

export interface SkillExecutionContext {
  command: Command;
  taskId: string;
  agentContext: AgentContext;
  llmClient?: LlmClient;
  allowedTools?: string[];
  disallowedTools?: string[];
  toolExecutor?: SkillToolExecutor;
}

export interface SkillToolExecutor {
  listTools(): AgentToolSpec[];
  execute(call: AgentToolCall, cwd: string, workspaceRoot?: string): Promise<string>;
}

export type SkillScriptFn = (
  args: Record<string, unknown>,
  context: SkillExecutionContext
) => Promise<unknown> | unknown;

export interface SkillScriptCall {
  script: string;
  args?: Record<string, unknown>;
}

export interface SkillExecutionResult {
  taskStatus: 'DONE' | 'FAILED';
  taskOutput: Record<string, unknown>;
  eventType: string;
  eventPayload?: Record<string, unknown>;
}

export interface AgentSkill {
  id: string;
  title: string;
  description: string;
  frontmatter?: SkillFrontmatter;
  execute(context: SkillExecutionContext): Promise<SkillExecutionResult>;
}

export interface SkillMetadata {
  id: string;
  title: string;
  description: string;
  sourcePath?: string;
  isolation?: SkillIsolationMode;
  tools?: string[];
  disallowedTools?: string[];
  skills?: string[];
  model?: string;
}

export interface SkillManifest extends SkillMetadata {
  loader: () => Promise<AgentSkill>;
}

export interface MarkdownSkillDefinition extends SkillMetadata {
  body: string;
  frontmatter: SkillFrontmatter;
  sourcePath: string;
}
