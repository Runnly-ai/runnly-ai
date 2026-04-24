import { Agent } from "./agent";


export interface CliTaskInput {
  instruction: string;
  cwd: string;
  model?: string;
}

export interface CliTaskResult {
  provider: string;
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Provider-specific CLI runner contract (Codex, Claude Code, Gemini, Copilot, etc).
 */
export interface CliTaskRunner {
  /**
   * @param input Task input for one CLI run.
   * @returns CLI execution result.
   */
  run(input: CliTaskInput): Promise<CliTaskResult>;
}

/**
 * Base class for agents whose core execution path calls a CLI runner.
 */
export abstract class CliAgent extends Agent {
  /**
   * @param id Agent identifier.
   * @param capabilities Routing capability tags.
   * @param runner Concrete CLI runner implementation.
   */
  constructor(
    id: string,
    capabilities: string[],
    protected readonly runner: CliTaskRunner
  ) {
    super(id, capabilities);
  }
}
