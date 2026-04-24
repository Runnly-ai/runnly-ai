import { spawn } from 'node:child_process';

interface GitClientOptions {
  gitPath: string;
}

export interface GitRunOptions {
  extraConfig?: string[];
}

/**
 * Thin git CLI wrapper used by SCM service orchestration.
 */
export class GitClient {
  /**
   * @param options Runtime options.
   */
  constructor(private readonly options: GitClientOptions) {}

  /**
   * @param repoUrl Remote repository URL.
   * @param targetDir Local directory for clone.
   * @param runOptions Optional command flags.
   */
  async cloneNoCheckout(repoUrl: string, targetDir: string, runOptions?: GitRunOptions): Promise<void> {
    await this.run(['clone', '--no-checkout', repoUrl, targetDir], runOptions);
  }

  /**
   * @param repoDir Existing clone directory.
   * @param baseBranch Base branch name.
   * @param runOptions Optional command flags.
   */
  async fetchBaseBranch(repoDir: string, baseBranch: string, runOptions?: GitRunOptions): Promise<void> {
    await this.run(['-C', repoDir, 'fetch', 'origin', baseBranch], runOptions);
  }

  /**
   * @param repoDir Existing clone directory.
   * @param worktreeDir New worktree directory.
   * @param branch New branch name.
   * @param baseBranch Base branch name.
   */
  async createWorktree(repoDir: string, worktreeDir: string, branch: string, baseBranch: string): Promise<void> {
    await this.run(['-C', repoDir, 'worktree', 'add', '-b', branch, worktreeDir, `origin/${baseBranch}`]);
  }

  /**
   * @param worktreeDir Working tree directory.
   * @returns True when there are local changes.
   */
  async hasChanges(worktreeDir: string): Promise<boolean> {
    const output = await this.run(['-C', worktreeDir, 'status', '--porcelain']);
    return output.trim().length > 0;
  }

  /**
   * @param worktreeDir Working tree directory.
   * @returns Git status output for debugging.
   */
  async getStatus(worktreeDir: string): Promise<string> {
    return await this.run(['-C', worktreeDir, 'status', '--porcelain']);
  }

  /**
   * @param worktreeDir Working tree directory.
   */
  async addAll(worktreeDir: string): Promise<void> {
    await this.run(['-C', worktreeDir, 'add', '-A']);
  }

  /**
   * @param worktreeDir Working tree directory.
   * @param message Commit message.
   * @param authorName Commit author name.
   * @param authorEmail Commit author email.
   */
  async commit(worktreeDir: string, message: string, authorName: string, authorEmail: string): Promise<void> {
    await this.run([
      '-C',
      worktreeDir,
      '-c',
      `user.name=${authorName}`,
      '-c',
      `user.email=${authorEmail}`,
      'commit',
      '-m',
      message,
    ]);
  }

  /**
   * @param worktreeDir Working tree directory.
   * @param branch Branch name.
   * @param runOptions Optional command flags.
   */
  async pushBranch(worktreeDir: string, branch: string, runOptions?: GitRunOptions): Promise<void> {
    await this.run(['-C', worktreeDir, 'push', '-u', 'origin', branch], runOptions);
  }

  private run(args: string[], runOptions?: GitRunOptions): Promise<string> {
    const finalArgs = [
      '-c',
      'credential.helper=',
      ...(runOptions?.extraConfig || []),
      ...args,
    ];
    const commandText = [this.options.gitPath, ...finalArgs].join(' ');
    return new Promise<string>((resolve, reject) => {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        // Enforce non-interactive git auth for automated agent flows.
        GIT_TERMINAL_PROMPT: '0',
        GCM_INTERACTIVE: 'Never',
      };
      const child = spawn(this.options.gitPath, finalArgs, {
        env,
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
        reject(new Error(`Failed to start git command (${commandText}): ${String(error)}`));
      });

      child.on('close', (code: number | null) => {
        const exitCode = code ?? -1;
        if (exitCode !== 0) {
          reject(
            new Error(
              [
                `Git command failed with exit code ${exitCode}`,
                `command: ${this.maskSecrets(commandText)}`,
                stderr ? `stderr: ${this.maskSecrets(stderr.trim())}` : '',
              ]
                .filter(Boolean)
                .join('\n')
            )
          );
          return;
        }

        resolve(stdout);
      });
    });
  }

  /**
   * Simple mask for standard token formats.
   */
  private maskSecrets(text: string): string {
    return text
      .replace(/ghp_[a-zA-Z0-9]{30,}/g, 'ghp_***')
      .replace(/ghs_[a-zA-Z0-9]{30,}/g, 'ghs_***')
      .replace(/:[a-zA-Z0-9_-]{20,}@/g, ':***@');
  }
}
