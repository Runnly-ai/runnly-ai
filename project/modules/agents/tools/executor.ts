import { AgentToolCall, AgentToolSpec } from './types';
import { getToolCatalog } from './registry';
import { filterReadonlyTools } from './policy';
import {
  readWorkspaceFile,
  writeWorkspaceFile,
  editWorkspaceFile,
  searchWorkspace,
  globWorkspace,
  deleteWorkspacePath,
  moveWorkspacePath,
  listWorkspaceDir,
} from './file';
import {
  getGitStatus,
  getGitDiff,
  getGitBranch,
  getGitLog,
  getGitBlame,
  getGitLsFiles,
  getGitRemote,
  getGitTag,
  getGitConfigGet,
  getGitReflog,
  getGitLsRemote,
  getGitAdd,
  getGitCommit,
  getGitCheckout,
  getGitMerge,
  getGitRebase,
  getGitReset,
  getGitStash,
  getGitCherryPick,
  getGitPush,
  getGitFetch,
  getGitWorktree,
} from './git';
import { executeAllowedShellCommand } from './shell';
import { searchTools } from './tool-search';

export interface AgentToolExecutorOptions {
  allowedShellCommandPrefixes?: string[];
  workspaceRoot?: string;
  allowAllCommands?: boolean;
  readonlyOnly?: boolean;
}

export class AgentToolExecutor {
  private readonly allowedShellCommandPrefixes: string[];
  private readonly workspaceRoot?: string;
  private readonly allowAllCommands: boolean;
  private readonly readonlyOnly: boolean;

  constructor(options: AgentToolExecutorOptions = {}) {
    this.allowedShellCommandPrefixes = options.allowedShellCommandPrefixes || [
      'npm', 'npx', 'pnpm', 'yarn', 'bun', 'node',
      'python', 'python3', 'pip', 'pip3', 'pytest', 'poetry', 'uv',
      'go', 'cargo', 'rustc', 'rustup', 'dotnet', 'mvn', 'gradle', './gradlew',
      'bundle', 'rake', 'php', 'composer', 'make', 'cmake', 'ls', 'dir', 'cat', 'type', 'rg', 'pwd',
    ];
    this.workspaceRoot = options.workspaceRoot;
    this.allowAllCommands = options.allowAllCommands ?? false;
    this.readonlyOnly = options.readonlyOnly ?? false;
  }

  listTools(): AgentToolSpec[] {
    const catalog = getToolCatalog();
    return this.readonlyOnly ? filterReadonlyTools(catalog) : catalog;
  }

  async execute(call: AgentToolCall, cwd: string, workspaceRoot?: string): Promise<string> {
    const root = workspaceRoot || this.workspaceRoot || cwd;
    switch (call.tool) {
      case 'read_file':
        return readWorkspaceFile(root, cwd, String(call.args.path || ''));
      case 'write_file':
        return writeWorkspaceFile(root, cwd, String(call.args.path || ''), String(call.args.content || ''));
      case 'search':
        return searchWorkspace(root, cwd, String(call.args.pattern || ''), String(call.args.path || '.'));
      case 'glob':
        return globWorkspace(root, cwd, String(call.args.pattern || ''), String(call.args.path || '.'));
      case 'delete_path':
        return deleteWorkspacePath(root, cwd, String(call.args.path || ''));
      case 'move_path':
        return moveWorkspacePath(root, cwd, String(call.args.from || ''), String(call.args.to || ''));
      case 'list_dir':
        return listWorkspaceDir(root, cwd, String(call.args.path || '.'));
      case 'edit_file':
        return editWorkspaceFile(root, cwd, String(call.args.path || ''), String(call.args.content || ''));
      case 'git_status':
        return getGitStatus(cwd);
      case 'git_diff':
        return getGitDiff(cwd);
      case 'git_branch':
        return getGitBranch(cwd, call.args.args as string | string[] | undefined);
      case 'git_log':
        return getGitLog(cwd, call.args.args as string | string[] | undefined);
      case 'git_blame':
        return getGitBlame(cwd, call.args.args as string | string[] | undefined);
      case 'git_ls_files':
        return getGitLsFiles(cwd, call.args.args as string | string[] | undefined);
      case 'git_remote':
        return getGitRemote(cwd, call.args.args as string | string[] | undefined);
      case 'git_tag':
        return getGitTag(cwd, call.args.args as string | string[] | undefined);
      case 'git_config_get':
        return getGitConfigGet(cwd, call.args.args as string | string[] | undefined);
      case 'git_reflog':
        return getGitReflog(cwd, call.args.args as string | string[] | undefined);
      case 'git_ls_remote':
        return getGitLsRemote(cwd, call.args.args as string | string[] | undefined);
      case 'git_add':
        return getGitAdd(cwd, call.args.args as string | string[] | undefined);
      case 'git_commit':
        return getGitCommit(cwd, call.args.args as string | string[] | undefined);
      case 'git_checkout':
        return getGitCheckout(cwd, call.args.args as string | string[] | undefined);
      case 'git_merge':
        return getGitMerge(cwd, call.args.args as string | string[] | undefined);
      case 'git_rebase':
        return getGitRebase(cwd, call.args.args as string | string[] | undefined);
      case 'git_reset':
        return getGitReset(cwd, call.args.args as string | string[] | undefined);
      case 'git_stash':
        return getGitStash(cwd, call.args.args as string | string[] | undefined);
      case 'git_cherry_pick':
        return getGitCherryPick(cwd, call.args.args as string | string[] | undefined);
      case 'git_push':
        return getGitPush(cwd, call.args.args as string | string[] | undefined);
      case 'git_fetch':
        return getGitFetch(cwd, call.args.args as string | string[] | undefined);
      case 'git_worktree':
        return getGitWorktree(cwd, call.args.args as string | string[] | undefined);
      case 'run_shell':
        return executeAllowedShellCommand({
          cwd,
          command: String(call.args.command || ''),
          allowAllCommands: this.allowAllCommands,
          allowedShellCommandPrefixes: this.allowedShellCommandPrefixes,
        });
      case 'pwd':
        return cwd;
      case 'file_size':
        return this.fileSize(root, cwd, String(call.args.path || ''));
      case 'tool_search':
        return searchTools(String(call.args.query || ''));
      default:
        throw new Error(`Unknown tool: ${call.tool}`);
    }
  }

  private async fileSize(workspaceRoot: string, cwd: string, targetPath: string): Promise<string> {
    const { stat } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const { normalize } = await import('node:path');
    const resolved = resolve(cwd, targetPath);
    const root = resolve(workspaceRoot);
    const normalizedRoot = normalize(root).endsWith('/') ? normalize(root) : `${normalize(root)}/`;
    const normalizedResolved = normalize(resolved).endsWith('/') ? normalize(resolved) : `${normalize(resolved)}/`;
    if (!normalizedResolved.startsWith(normalizedRoot)) {
      throw new Error(`Path escapes workspace root: ${targetPath}`);
    }
    const result = await stat(resolved);
    return `${targetPath}: ${result.size} bytes`;
  }
}
