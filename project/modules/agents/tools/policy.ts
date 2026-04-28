import { AgentToolSpec } from './types';

const READ_TOOL_NAMES = new Set(['read_file', 'search', 'list_dir', 'git_status', 'git_diff']);

export function filterReadonlyTools(tools: AgentToolSpec[]): AgentToolSpec[] {
  return tools.filter((tool) => READ_TOOL_NAMES.has(tool.name));
}

export function isShellCommandAllowed(command: string, allowAllCommands: boolean, allowedPrefixes: string[]): boolean {
  if (allowAllCommands) {
    return true;
  }
  const trimmed = command.trim();
  if (!trimmed) {
    return false;
  }
  const forbidden = ['&&', '||', ';', '|', '>', '<', '$(', '`'];
  if (forbidden.some((token) => trimmed.includes(token))) {
    return false;
  }
  const lowered = trimmed.toLowerCase();
  return allowedPrefixes.some((prefix) => lowered === prefix || lowered.startsWith(`${prefix} `));
}
