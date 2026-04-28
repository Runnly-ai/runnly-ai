import { spawn } from 'node:child_process';
import { resolveWorkspacePath } from './shared';

export async function searchWorkspace(
  workspaceRoot: string,
  cwd: string,
  pattern: string,
  searchPath: string
): Promise<string> {
  const resolved = resolveWorkspacePath(workspaceRoot, cwd, searchPath);
  return new Promise<string>((resolve) => {
    const child = spawn('rg', ['--line-number', '--no-heading', '--color', 'never', pattern, resolved], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('error', () => resolve(`Search failed for pattern: ${pattern}`));
    child.on('close', (code: number | null) => {
      if (code === 0 || code === 1) {
        resolve(stdout.trim() || 'No matches');
        return;
      }
      resolve(`Search failed (${code ?? -1}): ${stderr || stdout}`.trim());
    });
  });
}
