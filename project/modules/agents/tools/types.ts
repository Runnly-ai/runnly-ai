import type { AgentToolName } from '../agents/providers/agent-tools';

export type AgentToolIntent =
  | 'read'
  | 'write'
  | 'search'
  | 'git'
  | 'shell'
  | 'destructive';

export interface AgentToolContext {
  cwd: string;
  workspaceRoot?: string;
  allowAllCommands?: boolean;
}

export interface AgentToolSpec {
  name: AgentToolName;
  description: string;
  args: string[];
  intent: AgentToolIntent;
}

export interface AgentToolCall {
  tool: string;
  args: Record<string, unknown>;
}
