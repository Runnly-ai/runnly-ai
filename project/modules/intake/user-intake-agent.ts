import { readFileSync } from 'fs';
import * as path from 'path';
import { AgentProviderRouter, LlmProviderId, RoleAgent } from '../agents';
import { SessionContext, normalizeSessionContext } from '../session';
import { Command } from '../command';
import { AgentContext } from '../agents';
import { AgentProviderRunResult } from '../agents';
import { ManagedIntakeRequest } from './types';

type IntakeProviderId = LlmProviderId;

interface UserIntakeAgentOptions {
  provider: IntakeProviderId;
  model?: string;
  cwd: string;
}

/**
 * LLM-backed translator from free-form user messages to structured workflow requests.
 */
export class UserIntakeAgent extends RoleAgent {
  private readonly soulProfile: string;

  constructor(
    providerRouter: AgentProviderRouter,
    private readonly intakeOptions: UserIntakeAgentOptions
  ) {
    super('intake-agent', 'intake', providerRouter, {
      defaultProvider: intakeOptions.provider,
      defaultModel: intakeOptions.model,
      defaultCwd: intakeOptions.cwd,
    });
    this.soulProfile = this.loadSoulProfile();
  }

  async parse(message: string): Promise<ManagedIntakeRequest> {
    const rawMessage = message.trim();
    if (!rawMessage) {
      throw new Error('Field `message` is required.');
    }

    const systemPrompt = this.buildIntakeSystemPrompt();
    const userPrompt = this.buildIntakeUserPrompt(rawMessage);
    const run = await this.providerRouter.run(this.intakeOptions.provider, {
      taskType: 'INTAKE' as any,
      userRequest: rawMessage,
      cwd: this.intakeOptions.cwd,
      model: this.intakeOptions.model,
      enableTools: false,
      // Legacy fields for backward compatibility
      instruction: userPrompt,
      systemPrompt,
      userPrompt,
    });
    if (run.exitCode !== 0) {
      throw new Error(`Intake provider failed: ${run.stderr || run.stdout || 'unknown error'}`);
    }

    const parsed = this.parseJson(run.stdout || '');
    return this.normalizeStructuredRequest(parsed, rawMessage);
  }

  /**
   * Intelligently ask for missing information based on context.
   * Instead of static template questions, the LLM crafts contextual questions.
   */
  async askForMissingInfo(
    currentRequest: any,
    missingFields: Array<{ field: string; reason: string; question: string }>,
    conversationHistory?: string
  ): Promise<string> {
    const systemPrompt = [
      'You are Ericada, a helpful delivery manager agent.',
      'The user started a task but some required information is missing.',
      'Your job is to ask for ONE missing piece of information in a natural, conversational way.',
      '',
      'Current task draft:',
      `Goal: ${currentRequest.goal || '(not specified)'}`,
      `Context: ${JSON.stringify(currentRequest.context || {}, null, 2)}`,
      '',
      'Missing information:',
      ...missingFields.map((f, i) => `${i + 1}. ${f.field}: ${f.reason}`),
      '',
      'Rules:',
      '- Ask for the FIRST missing field only',
      '- Be conversational and context-aware',
      '- Reference what the user already told you',
      '- Keep it brief (1-2 sentences)',
      '- Don\'t use templates or formal language',
      '',
      'Return ONLY the question text, no JSON, no formatting.',
    ].join('\n');

    const userPrompt = conversationHistory || 'Ask for the first missing information.';

    const run = await this.providerRouter.run(this.intakeOptions.provider, {
      taskType: 'INTAKE' as any,
      userRequest: userPrompt,
      cwd: this.intakeOptions.cwd,
      model: this.intakeOptions.model,
      enableTools: false,
      instruction: userPrompt,
      systemPrompt,
      userPrompt,
    });

    if (run.exitCode !== 0) {
      // Fallback to static question if LLM fails
      return missingFields[0]?.question || 'Please provide the missing information.';
    }

    return (run.stdout || '').trim() || missingFields[0]?.question || 'Please provide the missing information.';
  }

  private buildIntakeSystemPrompt(): string {
    return [
      'You are Ericada, the delivery manager agent.',
      'Use the following identity/personality profile to shape tone and empathy while keeping output strictly JSON:',
      '--- SOUL PROFILE START ---',
      this.soulProfile,
      '--- SOUL PROFILE END ---',
      'Return exactly one JSON object and nothing else.',
      '',
      'Output schema:',
      '{',
      '  "route": "CONVERSE" | "TASK",',
      '  "action": "CONVERSE" | "START_SESSION" | "GET_SESSION" | "GET_EVENTS",',
      '  "confidence": number,',
      '  "reply": string,',
      '  "rawMessageSanitized": string,',
      '  "scmDetected": boolean,',
      '  "goal": string,',
      '  "autoStart": boolean,',
      '  "context": object,',
      '  "sessionId": string',
      '}',
      '',
      'Rules:',
      '0) First classify route:',
      '- CONVERSE: user is chatting, asking explanation, greeting, or requesting guidance with no workflow execution.',
      '- TASK: user asks to build/change/run/check anything in workflow/session/orchestration.',
      '1) Detect SCM URL from rawMessage:',
      '- If SCM URL is present => scmDetected=true, extract to context.scm',
      '- If no SCM URL => scmDetected=false',
      '2) Extract goal intelligently:',
      '- Use the rawMessageSanitized (without SCM URL) as the goal',
      '- Keep the goal concise but preserve user intent',
      '- Don\'t add formality - keep user\'s natural language',
      '3) If route=CONVERSE then action must be CONVERSE and reply must be non-empty.',
      '4) If route=TASK and uncertain action, default to START_SESSION.',
      '5) START_SESSION must include goal and autoStart (default true unless user says not to start).',
      '6) GET_SESSION and GET_EVENTS must include sessionId.',
      '7) context.scm must include provider (github/azure-devops/gitlab) and repoUrl when scmDetected=true.',
      '8) Never output markdown, prose, or code fences. JSON only.',
      '',
      'Few-shot examples:',
      '',
      'Input: hi can you explain what this platform does',
      'Output:',
      '{',
      '  "route": "CONVERSE",',
      '  "action": "CONVERSE",',
      '  "confidence": 0.98,',
      '  "reply": "This platform turns your request into a workflow: planning, coding, testing, and review. It can also track sessions and stream progress.",',
      '  "rawMessageSanitized": "hi can you explain what this platform does",',
      '  "scmDetected": false,',
      '  "goal": "",',
      '  "autoStart": true,',
      '  "context": {},',
      '  "sessionId": ""',
      '}',
      '',
      'Input: setup next.js in TS for https://github.com/org/repo.git',
      'Output:',
      '{',
      '  "route": "TASK",',
      '  "action": "START_SESSION",',
      '  "confidence": 0.95,',
      '  "reply": "",',
      '  "rawMessageSanitized": "setup next.js in TS",',
      '  "scmDetected": true,',
      '  "goal": "setup next.js in TS",',
      '  "autoStart": true,',
      '  "context": {',
      '    "scm": {',
      '      "provider": "github",',
      '      "repoUrl": "https://github.com/org/repo.git"',
      '    }',
      '  },',
      '  "sessionId": ""',
      '}',
      '',
      'Input: add a login page to my react app',
      'Output:',
      '{',
      '  "route": "TASK",',
      '  "action": "START_SESSION",',
      '  "confidence": 0.9,',
      '  "reply": "",',
      '  "rawMessageSanitized": "add a login page to my react app",',
      '  "scmDetected": false,',
      '  "goal": "add a login page to my react app",',
      '  "autoStart": true,',
      '  "context": {},',
      '  "sessionId": ""',
      '}',
      '',
      'Input: create session for adding login page but do not start yet',
      'Output:',
      '{',
      '  "route": "TASK",',
      '  "action": "START_SESSION",',
      '  "confidence": 0.9,',
      '  "reply": "",',
      '  "rawMessageSanitized": "create session for adding login page but do not start yet",',
      '  "scmDetected": false,',
      '  "goal": "adding login page",',
      '  "autoStart": false,',
      '  "context": {},',
      '  "sessionId": ""',
      '}',
      '',
      'Input:',
      'rawMessage: show events for session sess_12345',
      '',
      'Output:',
      '{',
      '  "route": "TASK",',
      '  "action": "GET_EVENTS",',
      '  "confidence": 0.98,',
      '  "reply": "",',
      '  "rawMessageSanitized": "show events for session sess_12345",',
      '  "scmDetected": false,',
      '  "goal": "",',
      '  "autoStart": true,',
      '  "context": {},',
      '  "sessionId": "sess_12345"',
      '}',
    ].join('\n');
  }

  private loadSoulProfile(): string {
    const soulPath = path.join(process.cwd(), 'modules', 'intake', 'soul.md');
    try {
      const content = readFileSync(soulPath, 'utf8').trim();
      if (content) {
        return content;
      }
    } catch {
      // Fall through to default profile text.
    }
    return [
      '# Ericada - Delivery Manager Agent Soul',
      '- Identity: Calm, practical, and user-first delivery manager agent.',
      '- Voice: Clear, concise, respectful, and warm without fluff.',
      '- Goal: Decide whether to reply directly or start managed execution work.',
      '- Behavior: Ask no unnecessary questions. Prefer useful, immediate help.',
    ].join('\n');
  }

  private buildIntakeUserPrompt(rawMessage: string): string {
    return `rawMessage: ${rawMessage}`;
  }

  async execute(_command: Command, _context: AgentContext): Promise<void> {
    throw new Error('UserIntakeAgent is request-driven and does not handle queued commands.');
  }

  protected decide(_command: Command, _result: AgentProviderRunResult) {
    return {
      status: 'FAILED' as const,
      eventType: 'COMMAND_FAILED',
      taskOutput: { reason: 'UserIntakeAgent does not execute queue commands.' },
    };
  }

  private parseJson(content: string): unknown {
    const trimmed = content.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const first = trimmed.indexOf('{');
      const last = trimmed.lastIndexOf('}');
      if (first >= 0 && last > first) {
        const slice = trimmed.slice(first, last + 1);
        return JSON.parse(slice);
      }
      throw new Error('Intake model did not return valid JSON.');
    }
  }

  private normalizeStructuredRequest(payload: unknown, rawMessage: string): ManagedIntakeRequest {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Intake model returned an invalid payload shape.');
    }
    const record = payload as Record<string, unknown>;
    const action = String(record.action || '').trim();
    const route = String(record.route || '').trim().toUpperCase();
    const confidence = this.normalizeConfidence(record.confidence);
    const reply = String(record.reply || '').trim();

    if (action === 'CONVERSE' || route === 'CONVERSE') {
      return {
        action: 'CONVERSE',
        rawMessage,
        confidence,
        reply: reply || 'I can help with that. Tell me what you want to build or ask any question about the workflow.',
      };
    }

    if (action === 'GET_SESSION') {
      const sessionId = String(record.sessionId || '').trim();
      if (!sessionId) {
        throw new Error('Intake model returned GET_SESSION without sessionId.');
      }
      return {
        action: 'GET_SESSION',
        rawMessage,
        confidence,
        sessionId,
      };
    }

    if (action === 'GET_EVENTS') {
      const sessionId = String(record.sessionId || '').trim();
      if (!sessionId) {
        throw new Error('Intake model returned GET_EVENTS without sessionId.');
      }
      return {
        action: 'GET_EVENTS',
        rawMessage,
        confidence,
        sessionId,
      };
    }

    if (!action || !['START_SESSION', 'GET_SESSION', 'GET_EVENTS'].includes(action)) {
      if (!this.hasStrongTaskIntent(rawMessage)) {
        return {
          action: 'CONVERSE',
          rawMessage,
          confidence,
          reply: reply || 'I can answer directly, or if you want me to execute work, describe the task and I will run it through orchestration.',
        };
      }
    }

    const goal = String(record.goal || rawMessage).trim() || rawMessage;
    const explicitNoStart = this.hasExplicitNoStartIntent(rawMessage);
    const modelAutoStart = typeof record.autoStart === 'boolean' ? record.autoStart : undefined;
    const autoStart = explicitNoStart ? false : modelAutoStart !== false;
    const context = this.normalizeContext(record.context, rawMessage);
    return {
      action: 'START_SESSION',
      rawMessage,
      confidence,
      goal,
      autoStart,
      context,
    };
  }

  private normalizeConfidence(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) {
      return 0.7;
    }
    if (n < 0) {
      return 0;
    }
    if (n > 1) {
      return 1;
    }
    return n;
  }

  private normalizeContext(value: unknown, rawMessage: string): SessionContext {
    const base = (!value || typeof value !== 'object' || Array.isArray(value))
      ? {}
      : (value as Record<string, unknown>);

    const hasScm = this.hasScmContext(base);
    if (hasScm) {
      return base;
    }

    const extractedScm = this.extractScmFromMessage(rawMessage);
    if (!extractedScm) {
      return normalizeSessionContext(base);
    }

    return normalizeSessionContext({
      ...base,
      scm: extractedScm,
    });
  }

  private hasScmContext(value: Record<string, unknown>): boolean {
    const scm = value.scm;
    if (!scm || typeof scm !== 'object' || Array.isArray(scm)) {
      return false;
    }
    const record = scm as Record<string, unknown>;
    return typeof record.repoUrl === 'string' && record.repoUrl.trim().length > 0;
  }

  private extractScmFromMessage(rawMessage: string): Record<string, unknown> | null {
    const url = this.extractRepositoryUrl(rawMessage);
    if (!url) {
      return null;
    }
    const provider = this.detectProvider(url);
    if (!provider) {
      return null;
    }
    return {
      provider,
      repoUrl: url,
    };
  }

  private extractRepositoryUrl(rawMessage: string): string | null {
    const match = rawMessage.match(/https?:\/\/[^\s"'`]+/i);
    if (!match) {
      return null;
    }
    const candidate = match[0].replace(/[),.;:!?]+$/, '');
    try {
      const parsed = new URL(candidate);
      return parsed.toString();
    } catch {
      return null;
    }
  }

  private detectProvider(url: string): 'github' | 'azure-devops' | null {
    const lowered = url.toLowerCase();
    if (lowered.includes('github.com')) {
      return 'github';
    }
    if (lowered.includes('dev.azure.com') || lowered.includes('visualstudio.com')) {
      return 'azure-devops';
    }
    return null;
  }

  private hasExplicitNoStartIntent(rawMessage: string): boolean {
    return /\b(do not start|don't start|without starting|create only|draft session|just create)\b/i.test(rawMessage);
  }

  private hasStrongTaskIntent(rawMessage: string): boolean {
    return /\b(build|implement|create|add|fix|refactor|run|start session|orchestr|workflow|session|task|bug|feature|test|review|deploy)\b/i.test(rawMessage);
  }
}
