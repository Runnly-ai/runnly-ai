import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import {
  AgentProviderId,
  CoderCliProviderId,
  LlmProviderId,
  isAgentProviderId,
  isLlmProviderId,
} from '../modules/agents';

loadEnv();

/**
 * Application runtime configuration derived from environment variables.
 */
export interface AppConfig {
  factoryWorkRoot: string;
  workspaceRootDir: string;
  logVerbose: boolean;
  port: number;
  workerPollMs: number;
  queueBackend: 'memory' | 'redis';
  eventBusBackend: 'memory' | 'redis';
  stateBackend: 'memory' | 'redis';
  redisUrl: string;
  redisKeyPrefix: string;
  redisCommandQueueKey: string;
  redisEventChannel: string;
  runWorker: boolean;
  runOrchestrator: boolean;
  logWorkflowProgress: boolean;
  logAgentDebug: boolean;
  logSessionToFile: boolean;
  sessionLogDir: string;
  dbBackend: 'sqlite' | 'postgres';
  sqliteDbPath: string;
  postgresUrl?: string;
  authSessionTtlHours: number;
  openaiApiKey?: string;
  openaiModel?: string;
  groqApiKey?: string;
  groqModel?: string;
  deepseekApiKey?: string;
  deepseekModel?: string;
  qwenApiKey?: string;
  qwenModel?: string;
  doubaoApiKey?: string;
  doubaoModel?: string;
  ollamaApiKey?: string;
  ollamaModel?: string;
  ollamaBaseUrl?: string;
  coderCliProvider: CoderCliProviderId;
  agentProviderDefault: AgentProviderId;
  agentProviderPlan?: AgentProviderId;
  agentProviderGenerate?: AgentProviderId;
  agentProviderVerify?: AgentProviderId;
  agentProviderReview?: AgentProviderId;
  agentProviderIntake?: LlmProviderId;
  agentModelDefault?: string;
  agentModelPlan?: string;
  agentModelGenerate?: string;
  agentModelVerify?: string;
  agentModelReview?: string;
  agentModelIntake?: string;
  agentSkillsDir?: string;
  agentMaxToolSteps: number;
  agentMaxIterations: number;
  codexModel?: string;
  copilotModel?: string;
  geminiModel?: string;
  coderDefaultCwd: string;
  scmGitPath: string;
  scmDefaultBaseBranch: string;
  scmGitUserName: string;
  scmGitUserEmail: string;
  scmRootDir: string;
  scmGithubToken?: string;
  scmAzureDevOpsToken?: string;
  scmGithubWebhookSecret?: string;
  scmAzureDevOpsWebhookSecret?: string;
}

/**
 * Splits a space-delimited CLI argument string into tokens.
 *
 * @param value Raw argument string from environment variable.
 * @returns Normalized argument token array.
 */
function parseArgs(value: string): string[] {
  return value
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseAgentProvider(value?: string): AgentProviderId | undefined {
  if (value && isAgentProviderId(value)) {
    return value;
  }
  return undefined;
}

function parseLlmProvider(value?: string): LlmProviderId | undefined {
  if (value && isLlmProviderId(value)) {
    return value;
  }
  return undefined;
}

function getPresetModel(provider?: AgentProviderId): string | undefined {
  switch (provider) {
    case AgentProviderId.Groq:
      return 'llama-3.3-70b-versatile';
    case AgentProviderId.DeepSeek:
      return 'deepseek-v4-flash';
    case AgentProviderId.Qwen:
      return 'qwen3-max';
    case AgentProviderId.Doubao:
      return 'doubao-seed-2-0-code-preview-260215';
    case AgentProviderId.Ollama:
      return 'qwen3-vl:8b';
    default:
      return undefined;
  }
}

function resolveAbsolutePath(value: string): string {
  if (!value.trim()) {
    return process.cwd();
  }
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

/**
 * Loads environment-driven application config with safe defaults.
 *
 * @returns Parsed application configuration.
 */
export function getAppConfig(): AppConfig {
  const dbBackend = process.env.DB_BACKEND === 'postgres' ? 'postgres' : 'sqlite';
  const queueBackend = process.env.QUEUE_BACKEND === 'redis' ? 'redis' : 'memory';
  const eventBusBackend = process.env.EVENT_BUS_BACKEND === 'redis' ? 'redis' : 'memory';
  const stateBackend = process.env.STATE_BACKEND === 'redis' ? 'redis' : 'memory';
  const coderCliProvider: CoderCliProviderId = process.env.CODER_CLI_PROVIDER === AgentProviderId.Copilot
    ? AgentProviderId.Copilot
    : AgentProviderId.Codex;
  
  // Simplified agent config pattern:
  // AGENT_PRESET/AGENT_PROVIDER + AGENT_MODEL + AGENT_API_KEY as primary config
  // Falls back to AGENT_PROVIDER_DEFAULT, AGENT_MODEL_DEFAULT, and provider-specific keys
  const presetProvider = parseAgentProvider(process.env.AGENT_PRESET);
  const agentProvider = parseAgentProvider(process.env.AGENT_PROVIDER) || presetProvider;
  const presetModel = getPresetModel(agentProvider);
  const agentProviderDefault = agentProvider || parseAgentProvider(process.env.AGENT_PROVIDER_DEFAULT) || AgentProviderId.Codex;
  const agentApiKey = process.env.AGENT_API_KEY;
  const agentModel = process.env.AGENT_MODEL || presetModel;
  
  const logVerbose = process.env.LOG_VERBOSE === 'true';
  const factoryWorkRoot = resolveAbsolutePath(process.env.FACTORY_WORK_ROOT || './.fw');
  const defaultCoderCwd = path.join(factoryWorkRoot, 'cwd');
  const defaultWorkspaceRoot = factoryWorkRoot;
  const defaultScmRoot = defaultWorkspaceRoot;
  const defaultSessionLogDir = path.join(factoryWorkRoot, 'logs', 's');
  const rawAgentMaxToolSteps = Number(process.env.AGENT_MAX_TOOL_STEPS || 20);
  const agentMaxToolSteps = Number.isFinite(rawAgentMaxToolSteps) && rawAgentMaxToolSteps > 0
    ? Math.floor(rawAgentMaxToolSteps)
    : 20;
  const rawAgentMaxIterations = Number(process.env.AGENT_MAX_ITERATIONS || 10);
  const agentMaxIterations = Number.isFinite(rawAgentMaxIterations) && rawAgentMaxIterations > 0
    ? Math.floor(rawAgentMaxIterations)
    : 10;
  const logSessionToFile = process.env.LOG_SESSION_TO_FILE !== 'false';
  const sessionLogDir = resolveAbsolutePath(process.env.SESSION_LOG_DIR || defaultSessionLogDir);
  const redisKeyPrefix = process.env.REDIS_KEY_PREFIX || 'runnly-ai';
  const redisCommandQueueKey = process.env.REDIS_COMMAND_QUEUE_KEY || `${redisKeyPrefix}:commands`;
  const redisEventChannel = process.env.REDIS_EVENT_CHANNEL || `${redisKeyPrefix}:events`;
  const rawAuthSessionTtlHours = Number(process.env.AUTH_SESSION_TTL_HOURS || 24 * 7);
  const authSessionTtlHours = Number.isFinite(rawAuthSessionTtlHours) && rawAuthSessionTtlHours > 0
    ? rawAuthSessionTtlHours
    : 24 * 7;
  
  // Map generic AGENT_API_KEY to provider-specific keys based on AGENT_PROVIDER
  const getProviderApiKey = (provider: AgentProviderId, specificKey?: string): string | undefined => {
    if (specificKey) return specificKey;
    if (agentApiKey && agentProvider === provider) return agentApiKey;
    return undefined;
  };
  
  const getProviderModel = (provider: AgentProviderId, specificModel?: string): string | undefined => {
    if (specificModel) return specificModel;
    if (agentModel && agentProvider === provider) return agentModel;
    return undefined;
  };

  return {
    factoryWorkRoot,
    workspaceRootDir: defaultWorkspaceRoot,
    logVerbose,
    port: Number(process.env.PORT || 3000),
    workerPollMs: Number(process.env.WORKER_POLL_MS || 100),
    queueBackend,
    eventBusBackend,
    stateBackend,
    redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    redisKeyPrefix,
    redisCommandQueueKey,
    redisEventChannel,
    runWorker: process.env.RUN_WORKER !== 'false',
    runOrchestrator: process.env.RUN_ORCHESTRATOR !== 'false',
    logWorkflowProgress: logVerbose || process.env.LOG_WORKFLOW_PROGRESS === 'true',
    logAgentDebug: logVerbose || process.env.LOG_AGENT_DEBUG === 'true',
    logSessionToFile,
    sessionLogDir,
    dbBackend,
    sqliteDbPath: process.env.SQLITE_DB_PATH || './data/runnly-ai.sqlite',
    postgresUrl: process.env.POSTGRES_URL || undefined,
    authSessionTtlHours,
    openaiApiKey: getProviderApiKey(AgentProviderId.OpenAI, process.env.OPENAI_API_KEY),
    openaiModel: getProviderModel(AgentProviderId.OpenAI, process.env.OPENAI_MODEL),
    groqApiKey: getProviderApiKey(AgentProviderId.Groq, process.env.GROQ_API_KEY),
    groqModel: getProviderModel(AgentProviderId.Groq, process.env.GROQ_MODEL),
    deepseekApiKey: getProviderApiKey(AgentProviderId.DeepSeek, process.env.DEEPSEEK_API_KEY),
    deepseekModel: getProviderModel(AgentProviderId.DeepSeek, process.env.DEEPSEEK_MODEL),
    qwenApiKey: getProviderApiKey(AgentProviderId.Qwen, process.env.QWEN_API_KEY),
    qwenModel: getProviderModel(AgentProviderId.Qwen, process.env.QWEN_MODEL),
    doubaoApiKey: getProviderApiKey(AgentProviderId.Doubao, process.env.DOUBAO_API_KEY),
    doubaoModel: getProviderModel(AgentProviderId.Doubao, process.env.DOUBAO_MODEL),
    ollamaApiKey: getProviderApiKey(AgentProviderId.Ollama, process.env.OLLAMA_API_KEY) || 'ollama',
    ollamaModel: getProviderModel(AgentProviderId.Ollama, process.env.OLLAMA_MODEL),
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || undefined,
    coderCliProvider,
    agentProviderDefault,
    agentProviderPlan: parseAgentProvider(process.env.AGENT_PROVIDER_PLAN),
    agentProviderGenerate: parseAgentProvider(process.env.AGENT_PROVIDER_GENERATE),
    agentProviderVerify: parseAgentProvider(process.env.AGENT_PROVIDER_VERIFY),
    agentProviderReview: parseAgentProvider(process.env.AGENT_PROVIDER_REVIEW),
    agentProviderIntake: parseLlmProvider(process.env.AGENT_PROVIDER_INTAKE),
    agentModelDefault: agentModel || process.env.AGENT_MODEL_DEFAULT || undefined,
    agentModelPlan: process.env.AGENT_MODEL_PLAN || undefined,
    agentModelGenerate: process.env.AGENT_MODEL_GENERATE || undefined,
    agentModelVerify: process.env.AGENT_MODEL_VERIFY || undefined,
    agentModelReview: process.env.AGENT_MODEL_REVIEW || undefined,
    agentModelIntake: process.env.AGENT_MODEL_INTAKE || undefined,
    agentSkillsDir: process.env.AGENT_SKILLS_DIR || './.skills',
    agentMaxToolSteps,
    agentMaxIterations,
    codexModel: process.env.CODEX_MODEL || undefined,
    copilotModel: process.env.COPILOT_MODEL || undefined,
    geminiModel: process.env.GEMINI_MODEL || undefined,
    coderDefaultCwd: defaultCoderCwd,
    scmGitPath: process.env.SCM_GIT_PATH || 'git',
    scmDefaultBaseBranch: process.env.SCM_DEFAULT_BASE_BRANCH || 'main',
    scmGitUserName: process.env.SCM_GIT_USER_NAME || 'runnly-ai',
    scmGitUserEmail: process.env.SCM_GIT_USER_EMAIL || 'runnly-ai@local',
    scmRootDir: defaultScmRoot,
    scmGithubToken: process.env.SCM_GITHUB_TOKEN || undefined,
    scmAzureDevOpsToken: process.env.SCM_AZURE_DEVOPS_TOKEN || undefined,
    scmGithubWebhookSecret: process.env.SCM_GITHUB_WEBHOOK_SECRET || undefined,
    scmAzureDevOpsWebhookSecret: process.env.SCM_AZURE_DEVOPS_WEBHOOK_SECRET || undefined,
  };
}
