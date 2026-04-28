import { spawn } from 'node:child_process';
import { isShellCommandAllowed } from '../policy';

export interface ShellExecutionOptions {
  cwd: string;
  command: string;
  allowAllCommands: boolean;
  allowedShellCommandPrefixes: string[];
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
    throw new Error(`Shell command not allowed: ${command}`);
  }
  const shellCommand = process.platform === 'win32'
    ? { command: 'powershell', args: ['-NoProfile', '-Command', command] }
    : { command: 'bash', args: ['-lc', command] };
  return spawnCommand(shellCommand.command, shellCommand.args, cwd);
}
