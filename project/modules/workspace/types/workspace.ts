/**
 * Execution workspace abstraction for agent operations.
 */
export abstract class Workspace {
  /**
   * Initializes workspace resources for a repository target.
   *
   * @param repo Repository identifier or URL.
   * @returns Workspace metadata containing repo id and local directory.
   */
  abstract init(repo: string): Promise<{ repo: string; dir: string }>;
  /**
   * Executes a command inside the workspace.
   *
   * @param cmd Command text to execute.
   * @returns Command result output.
   */
  abstract run(cmd: string): Promise<string>;
  /**
   * Commits current workspace changes.
   *
   * @param msg Commit message.
   * @returns Commit identifier or status message.
   */
  abstract commit(msg: string): Promise<string>;
  /**
   * Cleans up workspace resources.
   *
   * @returns Promise that resolves when cleanup is complete.
   */
  abstract cleanup(): Promise<void>;
}
