import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { AgentToolCall, AgentToolExecutor, AgentToolSpec } from './agent-tools';
interface BasicAgentToolboxOptions {
  allowedShellCommandPrefixes?: string[];
  workspaceRoot?: string;
}

/**
 * Basic local tools exposed to non-CLI providers (e.g., native OpenAI).
 */
export class BasicAgentToolbox implements AgentToolExecutor {
  private readonly allowedShellCommandPrefixes: string[];
  private readonly forbiddenShellSubstrings: string[];
  private readonly workspaceRoot?: string;

  constructor(options: BasicAgentToolboxOptions = {}) {
    this.allowedShellCommandPrefixes = options.allowedShellCommandPrefixes || [
      'npm',
      'npx',
      'pnpm',
      'yarn',
      'bun',
      'node',
      // Python
      'python',
      'python3',
      'pip',
      'pip3',
      'pytest',
      'poetry',
      'uv',
      // Go
      'go',
      // Rust
      'cargo',
      // .NET
      'dotnet',
      // Java/Kotlin
      'mvn',
      'gradle',
      './gradlew',
      // Ruby
      'bundle',
      'rake',
      // PHP
      'php',
      'composer',
      // General build tools
      'make',
      'cmake',
      // Basic inspection
      'ls',
      'dir',
      'cat',
      'type',
      'rg',
      'pwd',
    ];

    // We intentionally forbid common shell operators/expansions to keep the prefix allowlist meaningful.
    // If you need multiple commands, run them as separate tool calls.
    this.forbiddenShellSubstrings = [
      '&&',
      '||',
      ';',
      '|',
      '>',
      '<',
      '$(',
      '`',
    ];

    this.workspaceRoot = options.workspaceRoot;
  }

  /**
   * Tool catalog exposed to model prompts.
   */
  listTools(): AgentToolSpec[] {
    return [
      { name: 'read_file', description: 'Read UTF-8 file content.', args: ['path'] },
      { name: 'write_file', description: 'Write UTF-8 content to file path.', args: ['path', 'content'] },
      { name: 'search', description: 'Search for pattern using ripgrep.', args: ['pattern', 'path'] },
      { name: 'delete_path', description: 'Delete file or directory recursively.', args: ['path'] },
      { name: 'move_path', description: 'Move/rename file or directory.', args: ['from', 'to'] },
      { name: 'list_dir', description: 'List directory entries.', args: ['path'] },
      { name: 'git_status', description: 'Show git status (read-only).', args: [] },
      { name: 'git_diff', description: 'Show git diff (read-only, working tree vs index/HEAD).', args: [] },
      {
        name: 'run_shell',
        description:
          'Run ONE command inside the workspace cwd (no chaining like &&, ;, |). Command must start with an allowlisted prefix (npm|npx|pnpm|yarn|bun|node|python|python3|pip|pip3|pytest|poetry|uv|go|cargo|dotnet|mvn|gradle|./gradlew|bundle|rake|php|composer|make|cmake|ls|dir|cat|type|rg|pwd). Do NOT use cd; set cwd via the command payload instead.',
        args: ['command'],
      },
    ];
  }

  /**
   * Dispatches tool calls to concrete filesystem/shell operations.
   */
  async execute(call: AgentToolCall, cwd: string, workspaceRoot?: string): Promise<string> {
    const originalRoot = this.workspaceRoot;
    if (workspaceRoot) {
      (this as any).workspaceRoot = workspaceRoot;
    }

    try {
      switch (call.tool) {
        case 'read_file':
          return await this.readFile(cwd, String(call.args.path || ''));
        case 'write_file':
          return await this.writeFile(cwd, String(call.args.path || ''), String(call.args.content || ''));
        case 'search':
          return await this.search(cwd, String(call.args.pattern || ''), String(call.args.path || '.'));
        case 'delete_path':
          return await this.deletePath(cwd, String(call.args.path || ''));
        case 'move_path':
          return await this.movePath(cwd, String(call.args.from || ''), String(call.args.to || ''));
        case 'list_dir':
          return await this.listDir(cwd, String(call.args.path || '.'));
        case 'git_status':
          return await this.gitStatus(cwd);
        case 'git_diff':
          return await this.gitDiff(cwd);
        case 'run_shell':
          return await this.runShell(cwd, String(call.args.command || ''));
        default:
          throw new Error(`Unknown tool: ${call.tool}`);
      }
    } finally {
      (this as any).workspaceRoot = originalRoot;
    }
  }

  /**
   * Reads a UTF-8 file from the workspace.
   */
  private async readFile(cwd: string, filePath: string): Promise<string> {
    const resolved = this.resolvePath(cwd, filePath);
    const content = await fs.readFile(resolved, 'utf8');
    return content;
  }

  /**
   * Writes UTF-8 file content, creating parent directories when needed.
   */
  private async writeFile(cwd: string, filePath: string, content: string): Promise<string> {
    const resolved = this.resolvePath(cwd, filePath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf8');
    return `Wrote ${filePath}`;
  }

  /**
   * Searches text using ripgrep and returns formatted match output.
   */
  private async search(cwd: string, pattern: string, searchPath: string): Promise<string> {
    const resolved = this.resolvePath(cwd, searchPath);
    return new Promise<string>((resolve) => {
      const child = spawn('rg', ['--line-number', '--no-heading', '--color', 'never', pattern, resolved], {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', () => {
        resolve(`Search failed for pattern: ${pattern}`);
      });

      child.on('close', (code: number | null) => {
        if (code === 0 || code === 1) {
          resolve(stdout.trim() || 'No matches');
          return;
        }
        resolve(`Search failed (${code ?? -1}): ${stderr || stdout}`.trim());
      });
    });
  }

  /**
   * Deletes a file or directory recursively.
   */
  private async deletePath(cwd: string, targetPath: string): Promise<string> {
    const resolved = this.resolvePath(cwd, targetPath);
    await fs.rm(resolved, { recursive: true, force: true });
    return `Deleted ${targetPath}`;
  }

  /**
   * Moves/renames a file or directory within workspace boundaries.
   */
  private async movePath(cwd: string, fromPath: string, toPath: string): Promise<string> {
    const fromResolved = this.resolvePath(cwd, fromPath);
    const toResolved = this.resolvePath(cwd, toPath);
    await fs.mkdir(path.dirname(toResolved), { recursive: true });
    await fs.rename(fromResolved, toResolved);
    return `Moved ${fromPath} -> ${toPath}`;
  }

  /**
   * Lists immediate directory entries with file/dir markers.
   */
  private async listDir(cwd: string, targetPath: string): Promise<string> {
    const resolved = this.resolvePath(cwd, targetPath);
    const entries = await fs.readdir(resolved, { withFileTypes: true });
    return entries
      .map((entry) => `${entry.isDirectory() ? 'dir' : 'file'} ${entry.name}`)
      .join('\n');
  }

  /**
   * Runs an allowlisted shell command inside workspace cwd.
   */
  private runShell(cwd: string, command: string): Promise<string> {
    if (!command.trim()) {
      throw new Error('Missing shell command');
    }
    this.validateShellCommand(command);

    const shellCommand = process.platform === 'win32'
      ? { command: 'powershell', args: ['-NoProfile', '-Command', command] }
      : { command: 'bash', args: ['-lc', command] };

    return new Promise<string>((resolve, reject) => {
      const child = spawn(shellCommand.command, shellCommand.args, {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (error: unknown) => {
        reject(new Error(`Shell execution failed: ${String(error)}`));
      });

      child.on('close', (code: number | null) => {
        const exitCode = code ?? -1;
        if (exitCode !== 0) {
          reject(new Error(`Shell command failed (${exitCode}): ${stderr || stdout}`));
          return;
        }
        resolve(stdout.trim());
      });
    });
  }

  /**
   * Runs a read-only git status command inside cwd.
   */
  private gitStatus(cwd: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = spawn('git', ['status', '--porcelain=v1', '-b'], {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (error: unknown) => {
        reject(new Error(`git status failed: ${String(error)}`));
      });

      child.on('close', (code: number | null) => {
        const exitCode = code ?? -1;
        if (exitCode !== 0) {
          reject(new Error(`git status failed (${exitCode}): ${stderr || stdout}`));
          return;
        }
        resolve(stdout.trim());
      });
    });
  }

  /**
   * Runs a read-only git diff command inside cwd.
   */
  private gitDiff(cwd: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = spawn('git', ['diff', '--no-ext-diff', '--patch', '--no-color'], {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (error: unknown) => {
        reject(new Error(`git diff failed: ${String(error)}`));
      });

      child.on('close', (code: number | null) => {
        const exitCode = code ?? -1;
        if (exitCode !== 0) {
          reject(new Error(`git diff failed (${exitCode}): ${stderr || stdout}`));
          return;
        }
        resolve(stdout.trim() || 'No diff');
      });
    });
  }

  /**
   * Enforces shell-command prefix allowlist for safety.
   */
  private validateShellCommand(command: string): void {
    const trimmed = command.trim();
    for (const forbidden of this.forbiddenShellSubstrings) {
      if (trimmed.includes(forbidden)) {
        throw new Error(`Shell command not allowed (contains "${forbidden}"): ${command}`);
      }
    }

    const lowered = trimmed.toLowerCase();
    const matched = this.allowedShellCommandPrefixes.some((prefix) =>
      lowered === prefix || lowered.startsWith(`${prefix} `)
    );
    if (!matched) {
      throw new Error(`Shell command not allowed: ${command}`);
    }
  }

  /**
   * Resolves a user path and blocks traversal outside workspace root.
   */
  private resolvePath(cwd: string, requestedPath: string): string {
    if (!requestedPath.trim()) {
      throw new Error('Path is required');
    }

    const root = path.resolve(this.workspaceRoot || cwd);
    const resolved = path.resolve(cwd, requestedPath);
    const normalizedRoot = this.normalizeForPrefix(root);
    const normalizedResolved = this.normalizeForPrefix(resolved);

    if (!normalizedResolved.startsWith(normalizedRoot)) {
      throw new Error(`Path escapes workspace root: ${requestedPath}`);
    }

    return resolved;
  }

  /**
   * Normalizes paths for consistent prefix checks across OSes.
   */
  private normalizeForPrefix(value: string): string {
    const normalized = process.platform === 'win32' ? value.toLowerCase() : value;
    return normalized.endsWith(path.sep) ? normalized : `${normalized}${path.sep}`;
  }
}
