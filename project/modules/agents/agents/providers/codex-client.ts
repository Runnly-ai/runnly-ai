import { spawn } from 'node:child_process';
import { CliTaskInput, CliTaskResult, CliTaskRunner } from '../types/cli-agent';

/**
 * Codex-specific CLI task runner.
 */
export class CodexCliTaskRunner implements CliTaskRunner {
  baseArgs: string[];
  cliPath: string;

  constructor() {
    this.baseArgs = ["exec", "--yolo"];
    this.cliPath = "codex";
  }

  /**
   * @param input CLI task input.
   * @returns Process output when CLI exits with zero.
   */
  async run(input: CliTaskInput): Promise<CliTaskResult> {
    const args = [...this.baseArgs];
    if (input.model) {
      args.push('--model', input.model);
    }
    
    // Don't pass instruction as argument - use stdin instead for cross-platform compatibility
    const command = `${this.cliPath} ${args.join(' ')}`;
    
    return new Promise<CliTaskResult>((resolve, reject) => {
      // Use stdin to pass instruction - works identically on all platforms
      // shell: true needed to resolve .cmd files on Windows, but stdin prevents argument parsing issues
      const child = spawn(this.cliPath, args, {
        cwd: input.cwd,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],  // Enable stdin
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
        reject(new Error(`Failed to start Codex CLI (${command}): ${String(error)}`));
      });

      child.on('close', (code: number | null) => {
        const exitCode = code ?? -1;
        if (exitCode !== 0) {
          reject(
            new Error(
              [
                `Codex CLI failed with exit code ${exitCode}`,
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
          provider: 'codex-cli',
          command,
          cwd: input.cwd,
          exitCode,
          stdout,
          stderr,
        });
      });
      
      // Write instruction to stdin and close it
      child.stdin.write(input.instruction, 'utf8');
      child.stdin.end();
    });
  }
}
