import { spawn } from 'node:child_process';
import { isShellCommandAllowed } from '../policy';

export interface ShellExecutionOptions {
  cwd: string;
  command: string;
  allowAllCommands: boolean;
  allowedShellCommandPrefixes: string[];
}

function buildShellPolicyError(command: string, allowAllCommands: boolean, allowedPrefixes: string[]): string {
  const trimmed = command.trim();
  if (!trimmed) {
    return 'Shell command not allowed: empty command';
  }

  const forbidden = ['&&', '||', ';', '|', '>', '<', '$(', '`'];
  const hasForbiddenSyntax = forbidden.some((token) => trimmed.includes(token));
  if (hasForbiddenSyntax) {
    return [
      `Shell command not allowed: ${command}`,
      'Reason: command contains chaining, piping, redirection, or substitution syntax.',
      'Use a single direct command or a dedicated tool instead.',
    ].join(' ');
  }

  if (allowAllCommands) {
    return `Shell command not allowed: ${command}`;
  }

  const lowered = trimmed.toLowerCase();
  const matchedPrefix = allowedPrefixes.some((prefix) => lowered === prefix || lowered.startsWith(`${prefix} `));
  if (!matchedPrefix) {
    return [
      `Shell command not allowed: ${command}`,
      `Reason: command is not in the allowlist (${allowedPrefixes.join(', ')}).`,
      'Use a dedicated tool when available, or keep the command to a single allowlisted executable.',
    ].join(' ');
  }

  return `Shell command not allowed: ${command}`;
}

function spawnCommand(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error: unknown) => reject(new Error(`Command execution failed: ${String(error)}`)));
    child.on('close', (code: number | null) => {
      const exitCode = code ?? -1;
      if (exitCode !== 0) {
        reject(new Error(`Command failed (${exitCode}): ${stderr || stdout}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export async function executeAllowedShellCommand(options: ShellExecutionOptions): Promise<string> {
  const { cwd, command, allowAllCommands, allowedShellCommandPrefixes } = options;
  if (!isShellCommandAllowed(command, allowAllCommands, allowedShellCommandPrefixes)) {
    throw new Error(buildShellPolicyError(command, allowAllCommands, allowedShellCommandPrefixes));
  }
  const shellCommand = process.platform === 'win32'
    ? { command: 'powershell', args: ['-NoProfile', '-Command', command] }
    : { command: 'bash', args: ['-lc', command] };
  return spawnCommand(shellCommand.command, shellCommand.args, cwd);
}
