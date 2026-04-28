import { AgentToolSpec } from './types';

export const TOOL_CATALOG: AgentToolSpec[] = [
  { name: 'read_file', description: 'Read UTF-8 file content.', args: ['path'], intent: 'read' },
  { name: 'write_file', description: 'Write UTF-8 content to file path.', args: ['path', 'content'], intent: 'write' },
  { name: 'search', description: 'Search for pattern using ripgrep.', args: ['pattern', 'path'], intent: 'search' },
  { name: 'delete_path', description: 'Delete file or directory recursively.', args: ['path'], intent: 'destructive' },
  { name: 'move_path', description: 'Move/rename file or directory.', args: ['from', 'to'], intent: 'destructive' },
  { name: 'list_dir', description: 'List directory entries.', args: ['path'], intent: 'read' },
  { name: 'git_status', description: 'Show git status (read-only).', args: [], intent: 'git' },
  { name: 'git_diff', description: 'Show git diff (read-only, working tree vs index/HEAD).', args: [], intent: 'git' },
  { name: 'git_branch', description: 'Show or inspect git branches.', args: ['args'], intent: 'git' },
  { name: 'git_log', description: 'Show git commit history.', args: ['args'], intent: 'git' },
  { name: 'git_blame', description: 'Show git blame for a file or range.', args: ['args'], intent: 'git' },
  { name: 'git_ls_files', description: 'List files tracked by git.', args: ['args'], intent: 'git' },
  { name: 'git_remote', description: 'Inspect git remotes.', args: ['args'], intent: 'git' },
  { name: 'git_tag', description: 'Inspect git tags.', args: ['args'], intent: 'git' },
  { name: 'git_config_get', description: 'Read git config values.', args: ['args'], intent: 'git' },
  { name: 'git_reflog', description: 'Inspect git reflog.', args: ['args'], intent: 'git' },
  { name: 'git_ls_remote', description: 'Inspect remote refs from a git URL or remote.', args: ['args'], intent: 'git' },
  { name: 'git_add', description: 'Stage files for commit.', args: ['args'], intent: 'git' },
  { name: 'git_commit', description: 'Create a git commit.', args: ['args'], intent: 'git' },
  { name: 'git_checkout', description: 'Switch branches or paths.', args: ['args'], intent: 'git' },
  { name: 'git_merge', description: 'Merge branches or commits.', args: ['args'], intent: 'git' },
  { name: 'git_rebase', description: 'Rebase the current branch.', args: ['args'], intent: 'git' },
  { name: 'git_reset', description: 'Reset git state.', args: ['args'], intent: 'git' },
  { name: 'git_stash', description: 'Create or apply git stashes.', args: ['args'], intent: 'git' },
  { name: 'git_cherry_pick', description: 'Cherry-pick commits.', args: ['args'], intent: 'git' },
  { name: 'git_push', description: 'Push commits to a remote.', args: ['args'], intent: 'git' },
  { name: 'git_fetch', description: 'Fetch from a remote repository.', args: ['args'], intent: 'git' },
  { name: 'git_worktree', description: 'Manage git worktrees.', args: ['args'], intent: 'git' },
  { name: 'run_shell', description: 'Run one allowlisted shell command inside the workspace.', args: ['command'], intent: 'shell' },
  { name: 'pwd', description: 'Print the current working directory.', args: [], intent: 'read' },
  { name: 'file_size', description: 'Inspect the size of a file or directory.', args: ['path'], intent: 'read' },
  { name: 'glob', description: 'Find files by wildcard pattern.', args: ['pattern', 'path'], intent: 'search' },
  { name: 'tool_search', description: 'Search available tools by name or description.', args: ['query'], intent: 'read' },
  { name: 'edit_file', description: 'Edit an existing file with replacement content.', args: ['path', 'content'], intent: 'write' },
];

export function getToolCatalog(): AgentToolSpec[] {
  return TOOL_CATALOG;
}
