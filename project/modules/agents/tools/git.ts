import { spawn } from 'node:child_process';

function spawnGit(args: string[], cwd: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn('git', args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error: unknown) => reject(new Error(`git failed: ${String(error)}`)));
    child.on('close', (code: number | null) => {
      const exitCode = code ?? -1;
      if (exitCode !== 0) {
        reject(new Error(`git failed (${exitCode}): ${stderr || stdout}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function normalizeArgs(args: string | string[] | undefined): string[] {
  if (!args) {
    return [];
  }
  return Array.isArray(args) ? args : args.trim().split(/\s+/).filter(Boolean);
}

function runGit(cwd: string, args: string | string[] | undefined, base: string[]): Promise<string> {
  return spawnGit([...base, ...normalizeArgs(args)], cwd);
}

export async function getGitStatus(cwd: string): Promise<string> {
  return spawnGit(['status', '--porcelain=v1', '-b'], cwd);
}

export async function getGitDiff(cwd: string): Promise<string> {
  const output = await spawnGit(['diff', '--no-ext-diff', '--patch', '--no-color'], cwd);
  return output || 'No diff';
}

export async function getGitBranch(cwd: string, args?: string | string[]): Promise<string> {
  return runGit(cwd, args, ['branch']);
}

export async function getGitLog(cwd: string, args?: string | string[]): Promise<string> {
  return runGit(cwd, args, ['log', '--oneline', '--decorate', '--graph']);
}

export async function getGitBlame(cwd: string, args?: string | string[]): Promise<string> {
  return runGit(cwd, args, ['blame']);
}

export async function getGitLsFiles(cwd: string, args?: string | string[]): Promise<string> {
  return runGit(cwd, args, ['ls-files']);
}

export async function getGitRemote(cwd: string, args?: string | string[]): Promise<string> {
  return runGit(cwd, args, ['remote', '-v']);
}

export async function getGitTag(cwd: string, args?: string | string[]): Promise<string> {
  return runGit(cwd, args, ['tag']);
}

export async function getGitConfigGet(cwd: string, args?: string | string[]): Promise<string> {
  return runGit(cwd, args, ['config', '--get']);
}

export async function getGitReflog(cwd: string, args?: string | string[]): Promise<string> {
  return runGit(cwd, args, ['reflog']);
}

export async function getGitLsRemote(cwd: string, args?: string | string[]): Promise<string> {
  return runGit(cwd, args, ['ls-remote']);
}

export async function getGitAdd(cwd: string, args?: string | string[]): Promise<string> {
  return runGit(cwd, args, ['add']);
}

export async function getGitCommit(cwd: string, args?: string | string[]): Promise<string> {
  return runGit(cwd, args, ['commit']);
}

export async function getGitCheckout(cwd: string, args?: string | string[]): Promise<string> {
  return runGit(cwd, args, ['checkout']);
}

export async function getGitMerge(cwd: string, args?: string | string[]): Promise<string> {
  return runGit(cwd, args, ['merge']);
}

export async function getGitRebase(cwd: string, args?: string | string[]): Promise<string> {
  return runGit(cwd, args, ['rebase']);
}

export async function getGitReset(cwd: string, args?: string | string[]): Promise<string> {
  return runGit(cwd, args, ['reset']);
}

export async function getGitStash(cwd: string, args?: string | string[]): Promise<string> {
  return runGit(cwd, args, ['stash']);
}

export async function getGitCherryPick(cwd: string, args?: string | string[]): Promise<string> {
  return runGit(cwd, args, ['cherry-pick']);
}

export async function getGitPush(cwd: string, args?: string | string[]): Promise<string> {
  return runGit(cwd, args, ['push']);
}

export async function getGitFetch(cwd: string, args?: string | string[]): Promise<string> {
  return runGit(cwd, args, ['fetch']);
}

export async function getGitWorktree(cwd: string, args?: string | string[]): Promise<string> {
  return runGit(cwd, args, ['worktree']);
}
