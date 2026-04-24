import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GitClient } from './git-client';
import { Logger } from '../utils/logger';
import {
  PrepareWorkspaceInput,
  PublishChangesInput,
  PublishChangesResult,
  ScmProvider,
  ScmProviderType,
  ScmRepositoryRef,
  ScmWorkspaceInfo,
} from './types/scm';

interface ScmServiceOptions {
  rootDir?: string;
  gitPath: string;
  defaultBaseBranch: string;
  gitUserName: string;
  gitUserEmail: string;
  githubToken?: string;
  azureDevOpsToken?: string;
  logger?: Logger;
  logProgress?: boolean;
}

/**
 * SCM orchestration service responsible for local git operations and provider API calls.
 */
export class ScmService {
  private readonly git: GitClient;
  private readonly rootDir: string;
  private readonly logger?: Logger;
  private readonly logProgress: boolean;

  /**
   * @param providers Provider implementations keyed by type.
   * @param options Runtime options.
   */
  constructor(
    private readonly providers: Map<ScmProviderType, ScmProvider>,
    private readonly options: ScmServiceOptions
  ) {
    this.git = new GitClient({ gitPath: options.gitPath });
    this.rootDir = options.rootDir || path.join(os.tmpdir(), 'runnly-ai-scm');
    this.logger = options.logger;
    this.logProgress = options.logProgress ?? false;
  }

  /**
   * Parses a repository reference through provider-specific normalization.
   */
  parseRepository(config: { provider: ScmProviderType; repoUrl: string }): ScmRepositoryRef {
    return this.resolveProvider(config.provider).parseRepository(config.repoUrl);
  }

  /**
   * Clones repository and creates a session-isolated worktree branch.
   */
  async prepareWorkspace(input: PrepareWorkspaceInput): Promise<ScmWorkspaceInfo> {
    const provider = this.resolveProvider(input.config.provider);
    const repo = provider.parseRepository(input.config.repoUrl);
    const token = this.resolveToken(input.config.provider, input.config.token);
    this.requireTokenForProvider(input.config.provider, token);
    const remoteUrl = provider.buildAuthenticatedRepoUrl(input.config.repoUrl, token);
    const authConfig = provider.getGitAuthConfig(token);

    this.log('scm prepare started', {
      sessionId: input.sessionId,
      provider: input.config.provider,
      repository: repo.displayName,
      rootDir: this.rootDir,
    });

    await fs.mkdir(this.rootDir, { recursive: true });

    const sessionId = this.sanitizePathPart(input.sessionId);
    // Flatten path segments to avoid MAX_PATH issues on Windows.
    const sessionRoot = path.join(this.rootDir, sessionId);
    const repoDir = path.join(sessionRoot, 'r');
    const worktreeDir = path.join(sessionRoot, 'w');

    const baseBranch = input.config.baseBranch || this.options.defaultBaseBranch;
    const branch = this.buildSessionBranchName(input.sessionId);

    await this.resetWorkspaceDirectories(sessionRoot, repoDir, worktreeDir);

    await this.cloneRepositoryWithRecovery(remoteUrl, authConfig, repoDir, sessionId);
    this.log('scm clone completed', {
      sessionId: input.sessionId,
      repoDir,
    });

    await this.git.fetchBaseBranch(repoDir, baseBranch, { extraConfig: authConfig });
    this.log('scm fetch base branch completed', {
      sessionId: input.sessionId,
      repoDir,
      baseBranch,
    });

    await this.git.createWorktree(repoDir, worktreeDir, branch, baseBranch);
    this.log('scm worktree creation completed', {
      sessionId: input.sessionId,
      worktreeDir,
      branch,
      baseBranch,
    });

    const workspace = {
      rootDir: sessionRoot,
      repoDir,
      worktreeDir,
      branch,
      baseBranch,
    };
    this.log('scm prepare completed', {
      sessionId: input.sessionId,
      workspace,
    });
    return workspace;
  }

  /**
   * Commits and pushes local changes, creates PR, then fetches feedback signals.
   */
  async publishAndCollectFeedback(input: PublishChangesInput): Promise<PublishChangesResult> {
    const provider = this.resolveProvider(input.config.provider);
    const repo = provider.parseRepository(input.config.repoUrl);
    const token = this.resolveToken(input.config.provider, input.config.token);
    this.requireTokenForProvider(input.config.provider, token);
    const authConfig = provider.getGitAuthConfig(token);

    this.log('scm publish started', {
      sessionId: input.sessionId,
      provider: input.config.provider,
      repository: repo.displayName,
      worktreeDir: input.workspace.worktreeDir,
      branch: input.workspace.branch,
      baseBranch: input.workspace.baseBranch,
    });

    // Stage all changes first (files, modifications, deletions)
    await this.git.addAll(input.workspace.worktreeDir);

    // Check if git sees any changes
    let hasChanges = await this.git.hasChanges(input.workspace.worktreeDir);
    
    // If no tracked changes, check for empty directories and add .gitkeep
    if (!hasChanges) {
      const gitkeepCount = await this.addGitkeepToEmptyDirs(input.workspace.worktreeDir);
      if (gitkeepCount > 0) {
        this.log('scm added .gitkeep files to empty directories', {
          sessionId: input.sessionId,
          count: gitkeepCount,
        });
        // Re-stage after adding .gitkeep files
        await this.git.addAll(input.workspace.worktreeDir);
        hasChanges = await this.git.hasChanges(input.workspace.worktreeDir);
      }
    }
    
    if (!hasChanges) {
      const statusOutput = await this.git.getStatus(input.workspace.worktreeDir);
      
      this.log('scm publish skipped: no changes', {
        sessionId: input.sessionId,
        worktreeDir: input.workspace.worktreeDir,
        gitStatus: statusOutput || '(empty)',
      });
      return {
        changed: false,
        pipelineFailures: [],
        reviewComments: [],
      };
    }

    // Changes are already staged from git add -A above
    const commitMessage =
      input.config.commitMessage || `feat: apply agent changes for session ${input.sessionId}`;
    await this.git.commit(
      input.workspace.worktreeDir,
      commitMessage,
      this.options.gitUserName,
      this.options.gitUserEmail
    );
    this.log('scm git commit completed', {
      sessionId: input.sessionId,
      worktreeDir: input.workspace.worktreeDir,
    });

    await this.git.pushBranch(input.workspace.worktreeDir, input.workspace.branch, { extraConfig: authConfig });

    const pullRequest = await provider.createPullRequest({
      repo,
      token,
      title: input.config.prTitle || `Agent changes for session ${input.sessionId}`,
      description: input.config.prDescription || `Automated pull request for session ${input.sessionId}.`,
      sourceBranch: input.workspace.branch,
      targetBranch: input.workspace.baseBranch,
    });
    this.log('scm pull request creation completed', {
      sessionId: input.sessionId,
      pullRequestNumber: pullRequest.number,
      pullRequestUrl: pullRequest.url,
    });

    this.log('scm feedback collection started', {
      sessionId: input.sessionId,
      pullRequestNumber: pullRequest.number,
    });
    const [pipelineFailures, reviewComments] = await Promise.all([
      provider.listPipelineFailures({ repo, token, pullRequest }),
      provider.listReviewComments({ repo, token, pullRequest }),
    ]);
    this.log('scm feedback collection completed', {
      sessionId: input.sessionId,
      pullRequestNumber: pullRequest.number,
      pipelineFailureCount: pipelineFailures.length,
      reviewCommentCount: reviewComments.length,
    });

    const result = {
      changed: true,
      pullRequest,
      pipelineFailures,
      reviewComments,
    };
    this.log('scm publish completed', {
      sessionId: input.sessionId,
      changed: result.changed,
      pullRequestNumber: result.pullRequest.number,
    });
    return result;
  }

  private resolveProvider(type: ScmProviderType): ScmProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`No SCM provider registered for type: ${type}`);
    }
    return provider;
  }

  private resolveToken(type: ScmProviderType, configToken?: string): string | undefined {
    if (configToken) {
      return configToken;
    }
    if (type === 'github') {
      return this.options.githubToken;
    }
    return this.options.azureDevOpsToken;
  }

  private buildSessionBranchName(sessionId: string): string {
    const cleanId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    return `agent/${cleanId}`;
  }

  private sanitizePathPart(value: string): string {
    const clean = value.trim().replace(/[^a-zA-Z0-9._-]/g, '-');
    return clean || 'default';
  }

  /**
   * Recursively adds .gitkeep files to empty directories so git can track them.
   * @returns Number of .gitkeep files created.
   */
  private async addGitkeepToEmptyDirs(rootDir: string): Promise<number> {
    let count = 0;
    
    const processDir = async (dirPath: string): Promise<void> => {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      // Skip git directories
      if (path.basename(dirPath) === '.git') {
        return;
      }
      
      // Check if directory is empty (no files, only maybe subdirectories)
      const hasFiles = entries.some(e => e.isFile());
      const subdirs = entries.filter(e => e.isDirectory());
      
      // If no files in this dir, add .gitkeep
      if (!hasFiles && subdirs.length === 0) {
        const gitkeepPath = path.join(dirPath, '.gitkeep');
        await fs.writeFile(gitkeepPath, '');
        count++;
      }
      
      // Recursively process subdirectories
      for (const subdir of subdirs) {
        if (subdir.name !== '.git') {
          await processDir(path.join(dirPath, subdir.name));
        }
      }
    };
    
    try {
      await processDir(rootDir);
    } catch (error) {
      // Ignore errors during .gitkeep creation
      this.log('scm .gitkeep creation error (non-fatal)', {
        error: String(error),
      });
    }
    
    return count;
  }

  private requireTokenForProvider(type: ScmProviderType, token?: string): void {
    if (type !== 'github') {
      return;
    }
    if (token && token.trim().length > 0) {
      return;
    }
    throw new Error(
      'GitHub token is required for SCM operations. Set SCM_GITHUB_TOKEN or provide config.token.'
    );
  }

  private async resetWorkspaceDirectories(scmRoot: string, repoDir: string, worktreeDir: string): Promise<void> {
    await fs.rm(worktreeDir, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(repoDir, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(scmRoot, { recursive: true, force: true }).catch(() => undefined);
    await fs.mkdir(scmRoot, { recursive: true });
  }

  private async cloneRepositoryWithRecovery(
    remoteUrl: string,
    authConfig: string[],
    repoDir: string,
    sessionId: string
  ): Promise<void> {
    try {
      await this.git.cloneNoCheckout(remoteUrl, repoDir, { extraConfig: authConfig });
      return;
    } catch (error) {
      if (!this.isCloneTargetExistsError(error)) {
        throw error;
      }

      this.log('scm clone retrying after removing stale repository directory', {
        sessionId,
        repoDir,
      });
      await fs.rm(repoDir, { recursive: true, force: true }).catch(() => undefined);
      await this.git.cloneNoCheckout(remoteUrl, repoDir, { extraConfig: authConfig });
    }
  }

  private isCloneTargetExistsError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /File exists|already exists and is not an empty directory|destination path '.*' already exists/i.test(message);
  }

  private log(message: string, payload: Record<string, unknown>): void {
    if (!this.logProgress) {
      return;
    }
    this.logger?.info(message, payload);
  }
}
