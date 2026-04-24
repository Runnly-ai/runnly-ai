import { AgentProviderId, LlmProviderId } from './agent-provider';

export const DEFAULT_LLM_MODELS: Record<LlmProviderId, string> = {
  [AgentProviderId.OpenAI]: 'gpt-4.1-mini',
  [AgentProviderId.Groq]: 'llama-3.3-70b-versatile',
  [AgentProviderId.DeepSeek]: 'deepseek-chat',
  [AgentProviderId.Qwen]: 'qwen3-max',
  [AgentProviderId.Doubao]: 'doubao-seed-2-0-code-preview-260215',
  [AgentProviderId.Ollama]: 'gemma4:31b',
};
