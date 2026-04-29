import { AgentProvider, LlmProviderId, AgentProviderRunInput, AgentProviderRunResult } from '../types/agent-provider';
import { AgentToolCall, AgentToolExecutor, AgentToolName } from './agent-tools';
import OpenAI from 'openai';
import { Logger } from '../../../utils/logger';

interface LlmAgentProviderOptions {
  providerId: LlmProviderId;
  apiKey: string;
  defaultModel: string;
  baseUrl?: string;
  defaultSystemPrompt?: string;
  defaultUserPromptTemplate?: string;
  toolExecutor?: AgentToolExecutor;
  maxToolSteps?: number;
  logger?: Logger;
  logDebug?: boolean;
}

/**
 * Native OpenAI-backed provider adapter.
 */
export class LlmAgentProvider implements AgentProvider {
  readonly id: LlmProviderId;
  private readonly maxToolSteps: number;
  private readonly defaultModel: string;
  private readonly client: OpenAI;
  private readonly logger?: Logger;
  private readonly logDebug: boolean;

  constructor(private readonly options: LlmAgentProviderOptions) {
    this.id = options.providerId;
    this.maxToolSteps = options.maxToolSteps ?? 8;
    this.defaultModel = options.defaultModel;
    this.logger = options.logger;
    this.logDebug = options.logDebug ?? false;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl || 'https://api.openai.com/v1',
    });
  }

  /**
   * Executes provider run with both tool-calling loop and task iteration loop.
   * - Tool loop: Handles LLM calling tools within a single conversation turn
   * - Iteration loop: Continues working on task across multiple turns until complete
   */
  async run(input: AgentProviderRunInput): Promise<AgentProviderRunResult> {
    const chatClient = this.client;
    const toolExecutor = this.options.toolExecutor;
    const model = input.model || this.defaultModel;
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const enableTools = input.enableTools !== false;

    // Build prompts (backward compatible with old and new input formats)
    const systemPrompt = this.buildSystemPrompt(input, enableTools);
    const userPrompt = this.buildUserPrompt(input);

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: userPrompt,
      },
    ];

    const tools = toolExecutor && enableTools ? this.buildToolDefinitions(toolExecutor) : undefined;
    const maxIterations = input.maxIterations || 10;
    
    this.debug('provider run started', {
      runId,
      provider: this.id,
      model,
      cwd: input.cwd,
      agentRole: input.agentRole || 'unknown',
      commandType: input.commandType || input.taskType || 'unknown',
      sessionId: input.sessionId,
      commandId: input.commandId,
      taskId: input.taskId,
      maxToolSteps: this.maxToolSteps,
      maxIterations,
      toolsEnabled: Boolean(tools?.length),
      toolCount: tools?.length || 0,
    });

    let lastAssistantMessage: string = '';
    
    // ITERATION LOOP: Keep working until task is complete
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      this.debug('iteration started', {
        runId,
        provider: this.id,
        iteration: iteration + 1,
        maxIterations,
        messageCount: messages.length,
      });
      
      // TOOL LOOP: Handle tool calls within this iteration (existing logic preserved)
      let iterationComplete = false;
      for (let step = 0; step < this.maxToolSteps; step++) {
        let completion: OpenAI.Chat.Completions.ChatCompletion;
        try {
          const request: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
            model,
            messages,
            ...(tools ? { tools, tool_choice: 'auto' } : {}),
            temperature: 0.2,
          };
          if (this.id === 'deepseek') {
            (request as OpenAI.Chat.Completions.ChatCompletionCreateParams & {
              extra_body?: Record<string, unknown>;
            }).extra_body = { "thinking": { "type": "disabled" } };
          }

          completion = await chatClient.chat.completions.create(request);
        } catch (error: unknown) {
          this.logProviderError('provider completion call failed', runId, model, step, error, input);
          throw error;
        }

        const firstChoice = completion.choices?.[0];
        const message = completion.choices?.[0]?.message;
        this.debug('provider completion response', {
          runId,
          provider: this.id,
          model,
          agentRole: input.agentRole || 'unknown',
          commandType: input.commandType || input.taskType || 'unknown',
          sessionId: input.sessionId,
          commandId: input.commandId,
          taskId: input.taskId,
          iteration: iteration + 1,
          step: step + 1,
          finishReason: firstChoice?.finish_reason || null,
          toolCallCount: message?.tool_calls?.length || 0,
          assistantContent: this.formatAssistantContent(message?.content),
          promptTokens: completion.usage?.prompt_tokens,
          completionTokens: completion.usage?.completion_tokens,
          totalTokens: completion.usage?.total_tokens,
        });

        if (!message) {
          this.debug('provider response missing assistant message', {
            runId,
            provider: this.id,
            agentRole: input.agentRole || 'unknown',
            commandType: input.commandType || input.taskType || 'unknown',
            sessionId: input.sessionId,
            commandId: input.commandId,
            taskId: input.taskId,
            iteration: iteration + 1,
            step: step + 1,
          });
          iterationComplete = true;
          break;
        }

        const toolCalls = message.tool_calls || [];
        if (!toolExecutor || !enableTools || toolCalls.length === 0) {
          // No tool calls - this iteration is complete
          lastAssistantMessage = typeof message.content === 'string' ? message.content : '';
          this.debug('iteration completed without tool calls', {
            runId,
            provider: this.id,
            sessionId: input.sessionId,
            commandId: input.commandId,
            taskId: input.taskId,
            iteration: iteration + 1,
            step: step + 1,
            outputLength: lastAssistantMessage.length,
          });
          iterationComplete = true;
          break;
        }

        // Append assistant tool-call message before corresponding tool responses.
        const assistantMessage: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam & {
          reasoning_content?: string;
        } = {
          role: 'assistant',
          content: message.content ?? null,
          tool_calls: toolCalls,
        };
        const reasoningContent =
          this.id === 'deepseek'
            ? this.extractReasoningContent(message)
            : undefined;
        if (reasoningContent) {
          assistantMessage.reasoning_content = reasoningContent;
        }
        messages.push(assistantMessage);

        // Execute all tool calls
        for (const toolCall of toolCalls) {
          const callId = toolCall.id;
          if (!callId) {
            continue;
          }
          if (toolCall.type !== 'function') {
            messages.push({
              role: 'tool',
              tool_call_id: callId,
              content: `Unsupported tool call type: ${toolCall.type}`,
            });
            continue;
          }
          const toolName = toolCall.function?.name || '';

          let toolOutput = '';
          if (!this.isKnownTool(toolName)) {
            toolOutput = `Unknown tool requested: ${toolName}`;
            this.debug('provider rejected unknown tool', {
              runId,
              provider: this.id,
              agentRole: input.agentRole || 'unknown',
              commandType: input.commandType || input.taskType || 'unknown',
              sessionId: input.sessionId,
              commandId: input.commandId,
              taskId: input.taskId,
              iteration: iteration + 1,
              step: step + 1,
              callId,
              toolName,
            });
          } else {
            try {
              const parsedArgs = this.parseToolArguments(toolCall.function?.arguments);
              this.debug('provider executing tool', {
                runId,
                provider: this.id,
                agentRole: input.agentRole || 'unknown',
                commandType: input.commandType || input.taskType || 'unknown',
                sessionId: input.sessionId,
                commandId: input.commandId,
                taskId: input.taskId,
                iteration: iteration + 1,
                step: step + 1,
                callId,
                toolName,
                toolArgs: parsedArgs,
              });
              const call: AgentToolCall = {
                tool: toolName,
                args: parsedArgs,
              };
              toolOutput = await toolExecutor.execute(call, input.cwd, input.workspaceRoot);
              this.debug('provider tool execution succeeded', {
                runId,
                provider: this.id,
                agentRole: input.agentRole || 'unknown',
                commandType: input.commandType || input.taskType || 'unknown',
                sessionId: input.sessionId,
                commandId: input.commandId,
                taskId: input.taskId,
                iteration: iteration + 1,
                step: step + 1,
                callId,
                toolName,
                outputLength: toolOutput.length,
              });
            } catch (error: unknown) {
              toolOutput = `Tool execution failed for ${toolName}: ${String(error)}`;
              this.logger?.error('provider tool execution failed', {
                runId,
                provider: this.id,
                agentRole: input.agentRole || 'unknown',
                commandType: input.commandType || input.taskType || 'unknown',
                sessionId: input.sessionId,
                commandId: input.commandId,
                taskId: input.taskId,
                iteration: iteration + 1,
                step: step + 1,
                callId,
                toolName,
                error: this.describeError(error),
              });
            }
          }

          messages.push({
            role: 'tool',
            tool_call_id: callId,
            content: toolOutput,
          });
        }
        // Continue tool loop to process tool results
      }
      
      // Tool loop finished for this iteration
      if (!iterationComplete) {
        // Tool loop exhausted without final message
        this.debug('tool loop exhausted at iteration', {
          runId,
          provider: this.id,
          iteration: iteration + 1,
        });
      }
      
      // Check if we should continue iterating
      if (iteration === maxIterations - 1) {
        // Last iteration - return what we have
        this.debug('provider run completed at max iterations', {
          runId,
          provider: this.id,
          iteration: iteration + 1,
          maxIterations,
          outputLength: lastAssistantMessage.length,
        });
        return {
          provider: this.id,
          command: `${this.id}.chat.completions`,
          cwd: input.cwd,
          exitCode: 0,
          stdout: lastAssistantMessage || 'Task processing completed.',
          stderr: '',
        };
      }
      
      // Not the last iteration - check if we got a complete response
      if (lastAssistantMessage && iterationComplete) {
        // We have a response without tools - could be done or need continuation
        // For now, return it (agents can decide if they need more iterations)
        this.debug('provider run completed with response', {
          runId,
          provider: this.id,
          iteration: iteration + 1,
          outputLength: lastAssistantMessage.length,
        });
        return {
          provider: this.id,
          command: `${this.id}.chat.completions`,
          cwd: input.cwd,
          exitCode: 0,
          stdout: lastAssistantMessage,
          stderr: '',
        };
      }
      
      // Continue to next iteration - add continuation prompt
      this.debug('adding continuation prompt for next iteration', {
        runId,
        provider: this.id,
        iteration: iteration + 1,
      });
      messages.push({
        role: 'user',
        content: 'Continue working on the task. What is the next step?',
      });
    }

    // Should not reach here, but handle gracefully
    return {
      provider: this.id,
      command: `${this.id}.chat.completions`,
      cwd: input.cwd,
      exitCode: 0,
      stdout: lastAssistantMessage || 'Task processing completed.',
      stderr: '',
    };
  }

  /**
   * Builds system prompt from input (backward compatible).
   */
  private buildSystemPrompt(input: AgentProviderRunInput, enableTools: boolean): string {
    // Legacy: use systemPrompt if provided
    if (input.systemPrompt) {
      return input.systemPrompt.trim();
    }
    
    // Use default from options
    if (this.options.defaultSystemPrompt) {
      return this.options.defaultSystemPrompt.trim();
    }
    
    // Fallback to default
    return this.buildDefaultSystemPrompt(enableTools);
  }

  /**
   * Builds user prompt from input (backward compatible).
   */
  private buildUserPrompt(input: AgentProviderRunInput): string {
    // Legacy: use userPrompt if provided
    if (input.userPrompt) {
      return input.userPrompt.trim();
    }
    
    // Try template from options
    const fromTemplate = this.renderUserPromptTemplate(this.options.defaultUserPromptTemplate, input);
    if (fromTemplate) {
      return fromTemplate.trim();
    }
    
    // New format: build from structured fields
    if (input.userRequest) {
      const parts: string[] = [];
      
      if (input.taskTitle) {
        parts.push(`# Task: ${input.taskTitle}\n`);
      }
      
      parts.push(input.userRequest);
      
      if (input.taskDescription) {
        parts.push(`\n${input.taskDescription}`);
      }
      
      if (input.projectContext) {
        parts.push(`\n## Project Context\n${input.projectContext}`);
      }
      
      if (input.previousOutput) {
        parts.push(`\n## Previous Output\n${input.previousOutput}`);
      }
      
      if (input.skillContext) {
        parts.push(`\n## Skill Context\n${input.skillContext}`);
      }
      
      parts.push(`\nWorkspace: ${input.cwd}`);
      
      return parts.join('\n').trim();
    }
    
    // Legacy fallback
    return this.buildDefaultUserPrompt(input);
  }

  private buildDefaultSystemPrompt(enableTools: boolean): string {
    return [
      'You are a coding agent.',
      this.options.toolExecutor && enableTools
        ? 'When useful, call tools to inspect/edit workspace and then provide final answer.'
        : 'Respond directly with final answer.',
      'Be precise and concise.',
    ].join(' ');
  }

  private buildDefaultUserPrompt(input: AgentProviderRunInput): string {
    // Legacy: handle instruction field
    const instruction = input.instruction || input.userRequest || '';
    
    return [
      `Instruction:\n${instruction}`,
      input.skillContext ? `Skill context:\n${input.skillContext}` : '',
      `Workspace cwd: ${input.cwd}`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private renderUserPromptTemplate(template: string | undefined, input: AgentProviderRunInput): string {
    if (!template || !template.trim()) {
      return '';
    }
    
    // Backward compatible template variables
    const instruction = input.instruction || input.userRequest || '';
    
    return template
      .replaceAll('{{instruction}}', instruction)
      .replaceAll('{{userRequest}}', input.userRequest || '')
      .replaceAll('{{skillContext}}', input.skillContext || '')
      .replaceAll('{{cwd}}', input.cwd);
  }

  private debug(message: string, payload: Record<string, unknown>): void {
    if (!this.logDebug) {
      return;
    }
    this.logger?.info(`[agent-provider:${this.id}] ${message}`, payload);
  }

  private logProviderError(
    message: string,
    runId: string,
    model: string,
    step: number,
    error: unknown,
    input?: AgentProviderRunInput
  ): void {
    this.logger?.error(`[agent-provider:${this.id}] ${message}`, {
      runId,
      provider: this.id,
      model,
      agentRole: input?.agentRole || 'unknown',
      commandType: input?.commandType || 'unknown',
      sessionId: input?.sessionId,
      commandId: input?.commandId,
      taskId: input?.taskId,
      step: step + 1,
      error: this.describeError(error),
    });
  }

  private describeError(error: unknown): Record<string, unknown> {
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
      param?: unknown;
      requestID?: unknown;
      request_id?: unknown;
      error?: unknown;
      headers?: unknown;
    };

    const nested = value.error && typeof value.error === 'object'
      ? (value.error as Record<string, unknown>)
      : {};

    const headers = this.serializeHeaders(value.headers);
    const failedGeneration = nested.failed_generation;

    return {
      name: typeof value.name === 'string' ? value.name : undefined,
      message: typeof value.message === 'string' ? value.message : String(error),
      status: typeof value.status === 'number' ? value.status : undefined,
      code: typeof value.code === 'string' ? value.code : undefined,
      type: typeof value.type === 'string' ? value.type : undefined,
      param: typeof value.param === 'string' ? value.param : undefined,
      requestId:
        typeof value.requestID === 'string'
          ? value.requestID
          : typeof value.request_id === 'string'
          ? value.request_id
          : undefined,
      nestedCode: typeof nested.code === 'string' ? nested.code : undefined,
      nestedType: typeof nested.type === 'string' ? nested.type : undefined,
      nestedMessage: typeof nested.message === 'string' ? nested.message : undefined,
      failedGeneration:
        typeof failedGeneration === 'string'
          ? this.truncate(failedGeneration, 4000)
          : undefined,
      headers,
      stack:
        typeof value.stack === 'string'
          ? this.truncate(value.stack, 4000)
          : undefined,
    };
  }

  private serializeHeaders(value: unknown): Record<string, string> | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    if (value instanceof Headers) {
      return Object.fromEntries(value.entries());
    }

    return undefined;
  }

  /**
   * Validates tool names before execution.
   */
  private isKnownTool(value: string): value is AgentToolName {
    return (
      value === 'read_file' ||
      value === 'write_file' ||
      value === 'search' ||
      value === 'delete_path' ||
      value === 'move_path' ||
      value === 'list_dir' ||
      value === 'run_shell'
    );
  }

  private parseToolArguments(value: string | undefined): Record<string, unknown> {
    if (!value || !value.trim()) {
      return {};
    }
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private extractReasoningContent(message: unknown): string | undefined {
    if (!message || typeof message !== 'object') {
      return undefined;
    }
    const value = message as Record<string, unknown>;
    return typeof value.reasoning_content === 'string' ? value.reasoning_content : undefined;
  }

  private truncate(value: string, maxLen: number): string {
    if (value.length <= maxLen) {
      return value;
    }
    return `${value.slice(0, maxLen)}\n...truncated`;
  }

  private formatAssistantContent(content: unknown): string {
    if (typeof content === 'string') {
      return this.truncate(content, 4000);
    }
    if (content == null) {
      return '';
    }
    try {
      return this.truncate(JSON.stringify(content), 4000);
    } catch {
      return this.truncate(String(content), 4000);
    }
  }

  private buildToolDefinitions(toolExecutor: AgentToolExecutor): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return toolExecutor.listTools().map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(tool.args.map((arg) => [arg, { type: 'string' }])),
          required: [],
          additionalProperties: true,
        },
      },
    }));
  }
}
