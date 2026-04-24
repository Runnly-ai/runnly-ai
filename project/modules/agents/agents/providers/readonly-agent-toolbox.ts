import { BasicAgentToolbox } from './basic-agent-toolbox';
import { AgentToolSpec } from './agent-tools';

/**
 * Read-only toolbox for planning and analysis agents.
 * Only exposes safe, non-mutating tools.
 */
export class ReadonlyAgentToolbox extends BasicAgentToolbox {
  /**
   * Only exposes read-only tools: read_file, list_dir, search, git_status, git_diff.
   * Excludes: write_file, delete_path, move_path, run_shell.
   */
  listTools(): AgentToolSpec[] {
    const allTools = super.listTools();
    const readonlyToolNames = new Set(['read_file', 'list_dir', 'search', 'git_status', 'git_diff']);
    return allTools.filter((tool) => readonlyToolNames.has(tool.name));
  }
}
