export type AgentToolName =
  | 'read_file'
  | 'write_file'
  | 'search'
  | 'delete_path'
  | 'move_path'
  | 'list_dir'
  | 'git_status'
  | 'git_diff'
  | 'git_branch'
  | 'git_log'
  | 'git_blame'
  | 'git_ls_files'
  | 'git_remote'
  | 'git_tag'
  | 'git_config_get'
  | 'git_reflog'
  | 'git_ls_remote'
  | 'git_add'
  | 'git_commit'
  | 'git_checkout'
  | 'git_merge'
  | 'git_rebase'
  | 'git_reset'
  | 'git_stash'
  | 'git_cherry_pick'
  | 'git_push'
  | 'git_fetch'
  | 'git_worktree'
  | 'run_shell'
  | 'pwd'
  | 'file_size'
  | 'glob'
  | 'tool_search'
  | 'edit_file';

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
