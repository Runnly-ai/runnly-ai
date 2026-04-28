import fs from 'node:fs/promises';
import path from 'node:path';

export function normalizeForPrefix(value: string): string {
  const normalized = process.platform === 'win32' ? value.toLowerCase() : value;
  return normalized.endsWith(path.sep) ? normalized : `${normalized}${path.sep}`;
}

export function resolveWorkspacePath(workspaceRoot: string, cwd: string, requestedPath: string): string {
  if (!requestedPath.trim()) {
    throw new Error('Path is required');
  }
  const resolved = path.resolve(cwd, requestedPath);
  const normalizedRoot = normalizeForPrefix(path.resolve(workspaceRoot));
  const normalizedResolved = normalizeForPrefix(resolved);
  if (!normalizedResolved.startsWith(normalizedRoot)) {
    throw new Error(`Path escapes workspace root: ${requestedPath}`);
  }
  return resolved;
}

export async function readWorkspaceFile(workspaceRoot: string, cwd: string, filePath: string): Promise<string> {
  return fs.readFile(resolveWorkspacePath(workspaceRoot, cwd, filePath), 'utf8');
}

export async function writeWorkspaceFile(
  workspaceRoot: string,
  cwd: string,
  filePath: string,
  content: string
): Promise<string> {
  const resolved = resolveWorkspacePath(workspaceRoot, cwd, filePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content, 'utf8');
  return `Wrote ${filePath}`;
}

export async function editWorkspaceFile(
  workspaceRoot: string,
  cwd: string,
  filePath: string,
  content: string
): Promise<string> {
  return writeWorkspaceFile(workspaceRoot, cwd, filePath, content);
}

export async function deleteWorkspacePath(workspaceRoot: string, cwd: string, targetPath: string): Promise<string> {
  await fs.rm(resolveWorkspacePath(workspaceRoot, cwd, targetPath), { recursive: true, force: true });
  return `Deleted ${targetPath}`;
}

export async function moveWorkspacePath(
  workspaceRoot: string,
  cwd: string,
  fromPath: string,
  toPath: string
): Promise<string> {
  const fromResolved = resolveWorkspacePath(workspaceRoot, cwd, fromPath);
  const toResolved = resolveWorkspacePath(workspaceRoot, cwd, toPath);
  await fs.mkdir(path.dirname(toResolved), { recursive: true });
  await fs.rename(fromResolved, toResolved);
  return `Moved ${fromPath} -> ${toPath}`;
}

export async function listWorkspaceDir(workspaceRoot: string, cwd: string, targetPath: string): Promise<string> {
  const entries = await fs.readdir(resolveWorkspacePath(workspaceRoot, cwd, targetPath), { withFileTypes: true });
  return entries.map((entry) => `${entry.isDirectory() ? 'dir' : 'file'} ${entry.name}`).join('\n');
}
