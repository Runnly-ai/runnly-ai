import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { Workspace } from './types/workspace';

interface LocalWorkspaceOptions {
  rootDir?: string;
}

/**
 * Local temporary-directory workspace adapter.
 */
export class LocalWorkspace extends Workspace {
  private dir: string | null = null;
  private readonly rootDir: string;

  constructor(options: LocalWorkspaceOptions = {}) {
    super();
    this.rootDir = options.rootDir || os.tmpdir();
  }

  /**
   * @param repo Repository identifier or URL.
   * @returns Workspace metadata for the created temp directory.
   */
  async init(repo: string): Promise<{ repo: string; dir: string }> {
    await fs.mkdir(this.rootDir, { recursive: true });
    const prefix = path.join(this.rootDir, 'runnly-ai-');
    this.dir = await fs.mkdtemp(prefix);
    return { repo, dir: this.dir };
  }

  /**
   * @param cmd Command text to execute.
   * @returns Simulated command execution output.
   */
  async run(cmd: string): Promise<string> {
    return `workspace:${this.dir || 'uninitialized'} executed: ${cmd}`;
  }

  /**
   * @param msg Commit message.
   * @returns Simulated commit result.
   */
  async commit(msg: string): Promise<string> {
    return `workspace:${this.dir || 'uninitialized'} committed: ${msg}`;
  }

  /**
   * @returns Promise that resolves when the temp directory is removed.
   */
  async cleanup(): Promise<void> {
    if (!this.dir) {
      return;
    }
    await fs.rm(this.dir, { recursive: true, force: true });
    this.dir = null;
  }
}
