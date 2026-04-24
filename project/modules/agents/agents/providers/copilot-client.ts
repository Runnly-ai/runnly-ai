import { spawn } from 'node:child_process';
import { CliTaskInput, CliTaskResult, CliTaskRunner } from '../types/cli-agent';


/**
 * Copilot-specific CLI task runner.
 */
export class CopilotCliTaskRunner implements CliTaskRunner {
  baseArgs: string[];
  cliPath: string;
  suffixArgs: string[];

  constructor() {
    this.baseArgs = ["-p"];
    this.cliPath = "copilot";
    this.suffixArgs = ["--yolo"];
  }


  /**
   * @param input CLI task input.
   * @returns Process output when CLI exits with zero.
   */
  async run(input: CliTaskInput): Promise<CliTaskResult> {
    // Build args in correct order: copilot -p "instruction" --yolo [--model modelname]
    const args = [...this.baseArgs]; // ["-p"]
    
    // Instruction comes right after -p
    args.push(`"${input.instruction}"`);
    
    // Then suffix args (--yolo)
    args.push(...this.suffixArgs);
    
    // Model flag comes last if present
    if (input.model) {
      args.push('--model', input.model);
    }

    const command = `${this.cliPath} ${args.join(' ')}`;

    console.debug(`Running Copilot CLI command: ${command} in cwd: ${input.cwd}`);
    
    return new Promise<CliTaskResult>((resolve, reject) => {
      const child = spawn(this.cliPath, args, {
        cwd: input.cwd,
        env: process.env,
        stdio: ['inherit', 'pipe', 'pipe'],  // inherit stdin, pipe stdout/stderr
        shell: true,
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
        reject(new Error(`Failed to start Copilot CLI (${command}): ${String(error)}`));
      });

      child.on('close', (code: number | null) => {
        const exitCode = code ?? -1;
        if (exitCode !== 0) {
          reject(
            new Error(
              [
                `Copilot CLI failed with exit code ${exitCode}`,
                `command: ${command}`,
                stderr ? `stderr: ${stderr.trim()}` : '',
              ]
                .filter(Boolean)
                .join('\n')
            )
          );
          return;
        }

        resolve({
          provider: 'copilot-cli',
          command,
          cwd: input.cwd,
          exitCode,
          stdout,
          stderr,
        });
      });
    });
  }
}