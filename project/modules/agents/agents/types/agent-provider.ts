export enum AgentProviderId {
  Codex = 'codex',
  Copilot = 'copilot',
  Gemini = 'gemini',
  OpenAI = 'openai',
  Groq = 'groq',
  DeepSeek = 'deepseek',
  Qwen = 'qwen',
  Doubao = 'doubao',
  Ollama = 'ollama',
}

export type CoderCliProviderId = AgentProviderId.Codex | AgentProviderId.Copilot | AgentProviderId.Gemini;
export type LlmProviderId =
  | AgentProviderId.OpenAI
  | AgentProviderId.Groq
  | AgentProviderId.DeepSeek
  | AgentProviderId.Qwen
  | AgentProviderId.Doubao
  | AgentProviderId.Ollama;

export const CODER_CLI_PROVIDER_IDS: readonly CoderCliProviderId[] = [
  AgentProviderId.Codex,
  AgentProviderId.Copilot,
  AgentProviderId.Gemini,
];
export const LLM_PROVIDER_IDS: readonly LlmProviderId[] = [
  AgentProviderId.OpenAI,
  AgentProviderId.Groq,
  AgentProviderId.DeepSeek,
  AgentProviderId.Qwen,
  AgentProviderId.Doubao,
  AgentProviderId.Ollama,
];
export const AGENT_PROVIDER_IDS: readonly AgentProviderId[] = [
  AgentProviderId.Codex,
  AgentProviderId.Copilot,
  AgentProviderId.Gemini,
  ...LLM_PROVIDER_IDS,
];

export function isAgentProviderId(value: string): value is AgentProviderId {
  return AGENT_PROVIDER_IDS.includes(value as AgentProviderId);
}

export function isLlmProviderId(value: string): value is LlmProviderId {
  return LLM_PROVIDER_IDS.includes(value as LlmProviderId);
}

export interface AgentProviderRunInput {
  // Core task identification
  taskType: string;
  
  // Execution context
  cwd: string;
  workspaceRoot?: string;
  model?: string;
  
  // Task content - providers format as needed
  userRequest: string;              // Main user instruction/goal
  taskTitle?: string;
  taskDescription?: string;
  
  // Additional context
  projectContext?: string;          // Project design, rules, etc
  previousOutput?: string;          // For iterations
  skillContext?: string;            // Skill-specific context
  requirements?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  
  // Configuration
  maxIterations?: number;
  enableTools?: boolean;
  
  // Metadata for logging
  sessionId?: string;
  commandId?: string;
  taskId?: string;
  agentRole?: string;
  
  // Legacy fields (kept for backward compatibility during transition)
  instruction?: string;
  systemPrompt?: string;
  userPrompt?: string;
  commandType?: string;
}

export interface AgentProviderRunResult {
  provider: AgentProviderId;
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Unified provider contract used by role agents.
 */
export interface AgentProvider {
  readonly id: AgentProviderId;
  run(input: AgentProviderRunInput): Promise<AgentProviderRunResult>;
}
