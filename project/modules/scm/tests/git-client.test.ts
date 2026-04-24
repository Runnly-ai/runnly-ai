import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitClient } from '../git-client';
import { spawn } from 'node:child_process';

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

describe('GitClient', () => {
  let client: GitClient;
  let mockSpawn: any;

  beforeEach(() => {
    client = new GitClient({ gitPath: 'git' });
    mockSpawn = vi.mocked(spawn);
    
    // Default mock implementation
    mockSpawn.mockReturnValue({
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            // Can be called later if needed
          }
        }),
      },
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          callback(0); // Simulate successful exit
        }
      }),
    });
  });

  describe('cloneNoCheckout', () => {
    it('should call git clone with --no-checkout flag', async () => {
      await client.cloneNoCheckout('https://github.com/test/repo', '/tmp/target');
      
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['clone', '--no-checkout', 'https://github.com/test/repo', '/tmp/target']),
        expect.any(Object)
      );
    });
  });

  describe('fetchBaseBranch', () => {
    it('should call git fetch for specific branch', async () => {
      await client.fetchBaseBranch('/repo/dir', 'main');
      
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['-C', '/repo/dir', 'fetch', 'origin', 'main']),
        expect.any(Object)
      );
    });
  });

  describe('createWorktree', () => {
    it('should create a worktree with specified branch', async () => {
      await client.createWorktree('/repo', '/worktree', 'feature-branch', 'main');
      
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['-C', '/repo', 'worktree', 'add', '-b', 'feature-branch', '/worktree', 'origin/main']),
        expect.any(Object)
      );
    });
  });

  describe('hasChanges', () => {
    it('should return false when no changes', async () => {
      mockSpawn.mockReturnValue({
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from(''));
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      });

      const result = await client.hasChanges('/worktree');
      expect(result).toBe(false);
    });

    it('should return true when changes exist', async () => {
      mockSpawn.mockReturnValue({
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from(' M file.txt\n'));
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      });

      const result = await client.hasChanges('/worktree');
      expect(result).toBe(true);
    });
  });

  describe('addAll', () => {
    it('should call git add -A', async () => {
      await client.addAll('/worktree');
      
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['-C', '/worktree', 'add', '-A']),
        expect.any(Object)
      );
    });
  });

  describe('getStatus', () => {
    it('should return git status output', async () => {
      const statusOutput = ' M file1.txt\n?? file2.txt\n';
      
      mockSpawn.mockReturnValue({
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from(statusOutput));
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      });

      const result = await client.getStatus('/worktree');
      expect(result).toBe(statusOutput);
    });
  });
});
