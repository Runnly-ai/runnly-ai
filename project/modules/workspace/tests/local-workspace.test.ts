import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalWorkspace } from '../local-workspace';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('LocalWorkspace', () => {
  let workspace: LocalWorkspace;
  let createdDirs: string[] = [];

  beforeEach(() => {
    workspace = new LocalWorkspace();
  });

  afterEach(async () => {
    // Clean up created directories
    for (const dir of createdDirs) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    createdDirs = [];
  });

  describe('init', () => {
    it('should create a temp directory', async () => {
      const result = await workspace.init('test-repo');
      createdDirs.push(result.dir);

      expect(result.repo).toBe('test-repo');
      expect(result.dir).toBeTruthy();
      expect(result.dir).toContain('runnly-ai-');

      // Verify directory exists
      const stats = await fs.stat(result.dir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create unique directories', async () => {
      const workspace1 = new LocalWorkspace();
      const workspace2 = new LocalWorkspace();

      const result1 = await workspace1.init('repo1');
      const result2 = await workspace2.init('repo2');

      createdDirs.push(result1.dir, result2.dir);

      expect(result1.dir).not.toBe(result2.dir);
    });

    it('should use custom root directory', async () => {
      const customRoot = path.join(os.tmpdir(), 'custom-test-root');
      await fs.mkdir(customRoot, { recursive: true });
      createdDirs.push(customRoot);

      const customWorkspace = new LocalWorkspace({ rootDir: customRoot });
      const result = await customWorkspace.init('test-repo');
      createdDirs.push(result.dir);

      expect(result.dir).toContain(customRoot);
    });
  });

  describe('run', () => {
    it('should return command execution result', async () => {
      const result = await workspace.run('npm install');
      expect(result).toContain('executed: npm install');
    });

    it('should indicate uninitialized workspace', async () => {
      const result = await workspace.run('test command');
      expect(result).toContain('uninitialized');
    });

    it('should include workspace directory after init', async () => {
      const initResult = await workspace.init('test-repo');
      createdDirs.push(initResult.dir);

      const runResult = await workspace.run('test command');
      expect(runResult).toContain(initResult.dir);
      expect(runResult).toContain('executed: test command');
    });
  });

  describe('commit', () => {
    it('should return commit result', async () => {
      const result = await workspace.commit('Initial commit');
      expect(result).toContain('committed: Initial commit');
    });

    it('should indicate uninitialized workspace', async () => {
      const result = await workspace.commit('test commit');
      expect(result).toContain('uninitialized');
    });

    it('should include workspace directory after init', async () => {
      const initResult = await workspace.init('test-repo');
      createdDirs.push(initResult.dir);

      const commitResult = await workspace.commit('Test commit');
      expect(commitResult).toContain(initResult.dir);
      expect(commitResult).toContain('committed: Test commit');
    });
  });
});
