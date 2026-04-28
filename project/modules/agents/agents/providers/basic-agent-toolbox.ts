import { AgentToolCall, AgentToolExecutor as ToolExecutorBase, AgentToolSpec } from '../../tools';

interface BasicAgentToolboxOptions {
  allowedShellCommandPrefixes?: string[];
  workspaceRoot?: string;
  allowAllCommands?: boolean;
  readonlyOnly?: boolean;
}

/**
 * Basic local tools exposed to non-CLI providers (e.g. native OpenAI).
 */
export class BasicAgentToolbox extends ToolExecutorBase {
  constructor(options: BasicAgentToolboxOptions = {}) {
    super({
      allowedShellCommandPrefixes: options.allowedShellCommandPrefixes,
      workspaceRoot: options.workspaceRoot,
      allowAllCommands: options.allowAllCommands ?? false,
      readonlyOnly: options.readonlyOnly ?? false,
    });
  }
}

export type { AgentToolCall, AgentToolSpec };
