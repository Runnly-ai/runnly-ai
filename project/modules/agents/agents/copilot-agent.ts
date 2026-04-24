import { CliTaskRunner } from './types/cli-agent';
import { CoderAgent, CoderAgentOptions } from './codex-agent';

/**
 * Coder agent variant that is intended to run with Copilot CLI runner.
 */
export class CopilotCoderAgent extends CoderAgent {
  /**
   * @param runner Copilot CLI task runner.
   * @param options Static runtime options.
   */
  constructor(runner: CliTaskRunner, options: CoderAgentOptions) {
    super(runner, options);
  }
}
