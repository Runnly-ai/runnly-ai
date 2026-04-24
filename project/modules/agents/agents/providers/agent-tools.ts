export type AgentToolName =
  | 'read_file'
  | 'write_file'
  | 'search'
  | 'delete_path'
  | 'move_path'
  | 'list_dir'
  | 'git_status'
  | 'git_diff'
  | 'run_shell';

export interface AgentToolCall {
  tool: AgentToolName;
  args: Record<string, unknown>;
}

export interface AgentToolSpec {
  name: AgentToolName;
  description: string;
  args: string[];
}

/**
 * Tool execution contract for non-CLI providers.
 */
export interface AgentToolExecutor {
  /**
   * Returns machine- and human-readable tool metadata for model prompting.
   */
  listTools(): AgentToolSpec[];
  /**
   * Executes one tool call inside the provided workspace cwd.
   */
  execute(call: AgentToolCall, cwd: string, workspaceRoot?: string): Promise<string>;
}
