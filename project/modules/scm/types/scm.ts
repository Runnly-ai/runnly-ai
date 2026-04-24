export type ScmProviderType = 'github' | 'azure-devops';

/**
 * Detects SCM provider from repository URL.
 *
 * @param repoUrl Repository URL.
 * @returns Provider type when detected, otherwise undefined.
 */
export function detectScmProvider(repoUrl: string): ScmProviderType | undefined {
  const normalized = repoUrl.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized.includes('github.com')) {
    return 'github';
  }
  if (normalized.includes('dev.azure.com') || normalized.includes('.visualstudio.com')) {
    return 'azure-devops';
  }
  return undefined;
}

export interface ScmSessionConfig {
  provider: ScmProviderType;
  repoUrl: string;
  baseBranch?: string;
  token?: string;
  commitMessage?: string;
  prTitle?: string;
  prDescription?: string;
}

export interface ScmRepositoryRef {
  provider: ScmProviderType;
  repoUrl: string;
  displayName: string;
}

export interface PullRequestInfo {
  id: string;
  number: number;
  url: string;
  title: string;
  sourceBranch: string;
  targetBranch: string;
}

export interface PipelineFailureInfo {
  provider: ScmProviderType;
  source: string;
  name: string;
  status: string;
  url?: string;
  details?: string;
}

export interface ReviewCommentInfo {
  provider: ScmProviderType;
  author?: string;
  body: string;
  filePath?: string;
  line?: number;
  createdAt?: string;
  url?: string;
}

export interface CreatePullRequestInput {
  repo: ScmRepositoryRef;
  token?: string;
  title: string;
  description?: string;
  sourceBranch: string;
  targetBranch: string;
}

export interface PullRequestFeedbackInput {
  repo: ScmRepositoryRef;
  token?: string;
  pullRequest: PullRequestInfo;
}

export interface ScmProvider {
  readonly type: ScmProviderType;
  parseRepository(repoUrl: string): ScmRepositoryRef;
  buildAuthenticatedRepoUrl(repoUrl: string, token?: string): string;
  /**
   * Generates git -c configuration flags for non-interactive authentication.
   */
  getGitAuthConfig(token?: string): string[];
  createPullRequest(input: CreatePullRequestInput): Promise<PullRequestInfo>;
  listPipelineFailures(input: PullRequestFeedbackInput): Promise<PipelineFailureInfo[]>;
  listReviewComments(input: PullRequestFeedbackInput): Promise<ReviewCommentInfo[]>;
}

export interface ScmWorkspaceInfo {
  rootDir: string;
  repoDir: string;
  worktreeDir: string;
  branch: string;
  baseBranch: string;
}

export interface PrepareWorkspaceInput {
  sessionId: string;
  workspaceId?: string;
  config: ScmSessionConfig;
}

export interface PublishChangesInput {
  sessionId: string;
  config: ScmSessionConfig;
  workspace: ScmWorkspaceInfo;
}

export interface PublishChangesResult {
  changed: boolean;
  pullRequest?: PullRequestInfo;
  pipelineFailures: PipelineFailureInfo[];
  reviewComments: ReviewCommentInfo[];
}
