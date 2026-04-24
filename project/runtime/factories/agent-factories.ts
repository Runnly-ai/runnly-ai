import {
  AgentProvider,
  AgentProviderId,
  LlmProviderId,
  AgentProviderRouter,
  BasicAgentToolbox,
  ReadonlyAgentToolbox,
  CliAgentProvider,
  CodexCliTaskRunner,
  CopilotCliTaskRunner,
  GeminiCliTaskRunner,
  LlmAgentProvider,
  DEFAULT_LLM_MODELS,
  AgentRuntime,
  PlanningRoleAgent,
  GenerateRoleAgent,
  VerifyRoleAgent,
  ReviewRoleAgent,
} from '../../modules/agents';
import { generatePrompts, planningPrompts, reviewPrompts, verifyPrompts } from '../../modules/agents/prompts';
import { UserIntakeAgent, UserIntakeService, TaskValidationSchema } from '../../modules/intake';
import { AppConfig } from '../../config/app-config';
import { Logger } from '../../modules/utils/logger';
import { CommandService } from '../../modules/command';
import { EventService } from '../../modules/event';
import { TaskService } from '../../modules/task';
import { SessionService } from '../../modules/session';
import { LocalWorkspace } from '../../modules/workspace';
import { CommandQueue } from '../../modules/infra';
import { Command, CommandType } from '../../modules/command';
import { Agent } from '../../modules/agents';

type IntakeProviderId = LlmProviderId;

/**
 * Configuration for LLM-based agent providers.
 */
interface LlmProviderConfig {
  providerId: LlmProviderId;
  getApiKey: (config: AppConfig) => string | undefined;
  getModel: (config: AppConfig) => string | undefined;
  baseUrl: string;
  /** If true, always create provider even without API key (for Ollama) */
  alwaysCreate?: boolean;
  /** Default API key if none configured (for Ollama) */
  defaultApiKey?: string;
}

/**
 * Map of LLM provider configurations.
 */
const LLM_PROVIDER_CONFIGS: LlmProviderConfig[] = [
  {
    providerId: AgentProviderId.OpenAI as LlmProviderId,
    getApiKey: (config) => config.openaiApiKey,
    getModel: (config) => config.openaiModel,
    baseUrl: 'https://api.openai.com/v1',
  },
  {
    providerId: AgentProviderId.Groq as LlmProviderId,
    getApiKey: (config) => config.groqApiKey,
    getModel: (config) => config.groqModel,
    baseUrl: 'https://api.groq.com/openai/v1',
  },
  {
    providerId: AgentProviderId.DeepSeek as LlmProviderId,
    getApiKey: (config) => config.deepseekApiKey,
    getModel: (config) => config.deepseekModel,
    baseUrl: 'https://api.deepseek.com',
  },
  {
    providerId: AgentProviderId.Qwen as LlmProviderId,
    getApiKey: (config) => config.qwenApiKey,
    getModel: (config) => config.qwenModel,
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  {
    providerId: AgentProviderId.Doubao as LlmProviderId,
    getApiKey: (config) => config.doubaoApiKey,
    getModel: (config) => config.doubaoModel,
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  },
  {
    providerId: AgentProviderId.Ollama as LlmProviderId,
    getApiKey: (config) => config.ollamaApiKey,
    getModel: (config) => config.ollamaModel,
    baseUrl: '', // Will use config.ollamaBaseUrl
    alwaysCreate: true,
    defaultApiKey: 'ollama',
  },
];

/**
 * Creates LLM providers from configuration map.
 */
function createLlmProviders(
  config: AppConfig,
  logger: Logger,
  toolExecutor: BasicAgentToolbox | ReadonlyAgentToolbox
): Map<AgentProviderId, AgentProvider> {
  const providers = new Map<AgentProviderId, AgentProvider>();

  for (const providerConfig of LLM_PROVIDER_CONFIGS) {
    const apiKey = providerConfig.getApiKey(config);
    
    if (!apiKey && !providerConfig.alwaysCreate) {
      continue;
    }

    let baseUrl = providerConfig.baseUrl;
    if (providerConfig.providerId === AgentProviderId.Ollama) {
      baseUrl = config.ollamaBaseUrl || 'http://localhost:11434/v1';
    }

    providers.set(
      providerConfig.providerId,
      new LlmAgentProvider({
        providerId: providerConfig.providerId,
        apiKey: apiKey || providerConfig.defaultApiKey || '',
        defaultModel: providerConfig.getModel(config) || DEFAULT_LLM_MODELS[providerConfig.providerId],
        baseUrl,
        maxToolSteps: config.agentMaxToolSteps,
        toolExecutor,
        logger,
        logDebug: config.logAgentDebug,
      })
    );
  }

  return providers;
}

/**
 * Creates CLI providers (Codex, Copilot, Gemini).
 */
function createCliProviders(config: AppConfig): Map<AgentProviderId, AgentProvider> {
  const providers = new Map<AgentProviderId, AgentProvider>();

  providers.set(
    AgentProviderId.Codex,
    new CliAgentProvider(
      AgentProviderId.Codex,
      new CodexCliTaskRunner()
    )
  );

  providers.set(
    AgentProviderId.Copilot,
    new CliAgentProvider(
      AgentProviderId.Copilot,
      new CopilotCliTaskRunner()
    )
  );

  providers.set(
    AgentProviderId.Gemini,
    new CliAgentProvider(
      AgentProviderId.Gemini,
      new GeminiCliTaskRunner()
    )
  );

  return providers;
}

/**
 * Creates provider router for role-agent execution with full toolbox.
 */
export function createAgentProviderRouter(config: AppConfig, logger: Logger): AgentProviderRouter {
  const toolExecutor = new BasicAgentToolbox();
  const cliProviders = createCliProviders(config);
  const llmProviders = createLlmProviders(config, logger, toolExecutor);

  const providers = new Map([...cliProviders, ...llmProviders]);
  validateProvidersConfig(config, providers);

  return new AgentProviderRouter(providers, config.agentProviderDefault);
}

/**
 * Creates provider router with readonly toolbox for planning agents.
 * Planning agents can only read files, list directories, and search - no write operations.
 */
export function createPlanningProviderRouter(config: AppConfig, logger: Logger): AgentProviderRouter {
  const readonlyToolExecutor = new ReadonlyAgentToolbox();
  const cliProviders = createCliProviders(config);
  const llmProviders = createLlmProviders(config, logger, readonlyToolExecutor);

  const providers = new Map([...cliProviders, ...llmProviders]);
  return new AgentProviderRouter(providers, config.agentProviderDefault);
}

/**
 * Creates the LLM-backed user-intake agent configuration.
 */
export function createUserIntakeAgent(config: AppConfig, providerRouter: AgentProviderRouter): UserIntakeAgent {
  const configured = config.agentProviderIntake;
  const inferred: IntakeProviderId | undefined =
    configured ||
    (config.openaiApiKey ? AgentProviderId.OpenAI : undefined) ||
    (config.groqApiKey ? AgentProviderId.Groq : undefined) ||
    (config.deepseekApiKey ? AgentProviderId.DeepSeek : undefined) ||
    (config.qwenApiKey ? AgentProviderId.Qwen : undefined) ||
    (config.doubaoApiKey ? AgentProviderId.Doubao : undefined) ||
    AgentProviderId.Ollama;

  if (inferred === AgentProviderId.OpenAI) {
    if (!config.openaiApiKey) {
      throw new Error('AGENT_PROVIDER_INTAKE=openai but OPENAI_API_KEY is not configured.');
    }
    return new UserIntakeAgent(providerRouter, {
      provider: AgentProviderId.OpenAI,
      model:
        config.agentModelIntake ||
        config.agentModelDefault ||
        config.openaiModel ||
        DEFAULT_LLM_MODELS[AgentProviderId.OpenAI],
      cwd: config.coderDefaultCwd,
    });
  }

  if (inferred === AgentProviderId.Groq) {
    if (!config.groqApiKey) {
      throw new Error('AGENT_PROVIDER_INTAKE=groq but GROQ_API_KEY is not configured.');
    }
    return new UserIntakeAgent(providerRouter, {
      provider: AgentProviderId.Groq,
      model:
        config.agentModelIntake ||
        config.agentModelDefault ||
        config.groqModel ||
        DEFAULT_LLM_MODELS[AgentProviderId.Groq],
      cwd: config.coderDefaultCwd,
    });
  }

  if (inferred === AgentProviderId.DeepSeek) {
    if (!config.deepseekApiKey) {
      throw new Error('AGENT_PROVIDER_INTAKE=deepseek but DEEPSEEK_API_KEY is not configured.');
    }
    return new UserIntakeAgent(providerRouter, {
      provider: AgentProviderId.DeepSeek,
      model:
        config.agentModelIntake ||
        config.agentModelDefault ||
        config.deepseekModel ||
        DEFAULT_LLM_MODELS[AgentProviderId.DeepSeek],
      cwd: config.coderDefaultCwd,
    });
  }

  if (inferred === AgentProviderId.Qwen) {
    if (!config.qwenApiKey) {
      throw new Error('AGENT_PROVIDER_INTAKE=qwen but QWEN_API_KEY is not configured.');
    }
    return new UserIntakeAgent(providerRouter, {
      provider: AgentProviderId.Qwen,
      model:
        config.agentModelIntake ||
        config.agentModelDefault ||
        config.qwenModel ||
        DEFAULT_LLM_MODELS[AgentProviderId.Qwen],
      cwd: config.coderDefaultCwd,
    });
  }

  if (inferred === AgentProviderId.Doubao) {
    if (!config.doubaoApiKey) {
      throw new Error('AGENT_PROVIDER_INTAKE=doubao but DOUBAO_API_KEY is not configured.');
    }
    return new UserIntakeAgent(providerRouter, {
      provider: AgentProviderId.Doubao,
      model:
        config.agentModelIntake ||
        config.agentModelDefault ||
        config.doubaoModel ||
        DEFAULT_LLM_MODELS[AgentProviderId.Doubao],
      cwd: config.coderDefaultCwd,
    });
  }

  return new UserIntakeAgent(providerRouter, {
    provider: AgentProviderId.Ollama,
    model:
      config.agentModelIntake ||
      config.agentModelDefault ||
      config.ollamaModel ||
      DEFAULT_LLM_MODELS[AgentProviderId.Ollama],
    cwd: config.coderDefaultCwd,
  });
}

/**
 * Validates provider configuration and throws if misconfigured.
 */
function validateProvidersConfig(config: AppConfig, providers: Map<AgentProviderId, AgentProvider>): void {
  const configuredProviders = [
    config.agentProviderDefault,
    config.agentProviderPlan,
    config.agentProviderGenerate,
    config.agentProviderVerify,
    config.agentProviderReview,
  ].filter((value): value is AgentProviderId => Boolean(value));

  if (configuredProviders.includes(AgentProviderId.OpenAI) && !providers.has(AgentProviderId.OpenAI)) {
    throw new Error('Provider "openai" is selected but OPENAI_API_KEY is not configured.');
  }
  if (configuredProviders.includes(AgentProviderId.Groq) && !providers.has(AgentProviderId.Groq)) {
    throw new Error('Provider "groq" is selected but GROQ_API_KEY is not configured.');
  }
  if (configuredProviders.includes(AgentProviderId.DeepSeek) && !providers.has(AgentProviderId.DeepSeek)) {
    throw new Error('Provider "deepseek" is selected but DEEPSEEK_API_KEY is not configured.');
  }
  if (configuredProviders.includes(AgentProviderId.Qwen) && !providers.has(AgentProviderId.Qwen)) {
    throw new Error('Provider "qwen" is selected but QWEN_API_KEY is not configured.');
  }
  if (configuredProviders.includes(AgentProviderId.Doubao) && !providers.has(AgentProviderId.Doubao)) {
    throw new Error('Provider "doubao" is selected but DOUBAO_API_KEY is not configured.');
  }

  if (!providers.has(config.agentProviderDefault)) {
    throw new Error(`Default agent provider is unavailable: ${config.agentProviderDefault}`);
  }
}

/**
 * Creates the user intake service with its agent.
 */
export function createUserIntakeService(
  config: AppConfig,
  sessionService: SessionService,
  validationSchema: TaskValidationSchema,
  logger: Logger
): UserIntakeService {
  const providerRouter = createAgentProviderRouter(config, logger);
  const intakeAgent = createUserIntakeAgent(config, providerRouter);
  return new UserIntakeService(sessionService, intakeAgent, validationSchema, logger);
}

/**
 * Creates the complete agent runtime with all role agents and orchestration.
 */
export function createAgentRuntime(
  config: AppConfig,
  logger: Logger,
  deps: {
    queue: CommandQueue;
    commandService: CommandService;
    eventService: EventService;
    taskService: TaskService;
    workspace: LocalWorkspace;
  }
): AgentRuntime {
  return new AgentRuntime({
    queue: deps.queue,
    commandService: deps.commandService,
    eventService: deps.eventService,
    resolveAgent: async (command: Command) => createAgentForCommandType(config, logger, command.type),
    taskService: deps.taskService,
    workspace: deps.workspace,
    logger,
    logWorkflowProgress: config.logWorkflowProgress,
    logAgentDebug: config.logAgentDebug,
  });
}

function createAgentForCommandType(config: AppConfig, logger: Logger, type: CommandType): Agent | null {
  if (type === 'PLAN') {
    const planningProviderRouter = createPlanningProviderRouter(config, logger);
    return new PlanningRoleAgent(planningProviderRouter, {
      defaultProvider: config.agentProviderPlan,
      defaultModel: config.agentModelPlan || config.agentModelDefault,
      defaultCwd: config.coderDefaultCwd,
      maxIterations: config.agentMaxIterations,
    });
  }

  if (type === 'GENERATE' || type === 'FIX') {
    const providerRouter = createAgentProviderRouter(config, logger);
    return new GenerateRoleAgent(providerRouter, {
      defaultProvider: config.agentProviderGenerate,
      defaultModel: config.agentModelGenerate || config.agentModelDefault || config.codexModel || config.copilotModel,
      defaultCwd: config.coderDefaultCwd,
      maxIterations: config.agentMaxIterations,
    });
  }

  if (type === 'VERIFY') {
    const providerRouter = createAgentProviderRouter(config, logger);
    return new VerifyRoleAgent(providerRouter, {
      defaultProvider: config.agentProviderVerify,
      defaultModel: config.agentModelVerify || config.agentModelDefault,
      defaultCwd: config.coderDefaultCwd,
      maxIterations: config.agentMaxIterations,
    });
  }

  if (type === 'REVIEW') {
    const providerRouter = createAgentProviderRouter(config, logger);
    return new ReviewRoleAgent(providerRouter, {
      defaultProvider: config.agentProviderReview,
      defaultModel: config.agentModelReview || config.agentModelDefault,
      defaultCwd: config.coderDefaultCwd,
      maxIterations: config.agentMaxIterations,
    });
  }

  return null;
}
