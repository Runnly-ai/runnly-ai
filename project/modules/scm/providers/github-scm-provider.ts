import {
  CreatePullRequestInput,
  PipelineFailureInfo,
  PullRequestFeedbackInput,
  PullRequestInfo,
  ReviewCommentInfo,
  ScmProvider,
  ScmProviderType,
  ScmRepositoryRef,
} from '../types/scm';
import { requestJson } from './http';

interface GitHubRepoParts {
  owner: string;
  repo: string;
}

interface GitHubPullResponse {
  number: number;
  html_url: string;
  title: string;
  head: { ref: string; sha: string };
  base: { ref: string };
}

interface GitHubCheckRunsResponse {
  check_runs?: Array<{
    name?: string;
    status?: string;
    conclusion?: string | null;
    details_url?: string;
    html_url?: string;
  }>;
}

interface GitHubCommitStatusResponse {
  statuses?: Array<{
    context?: string;
    state?: string;
    target_url?: string;
    description?: string;
  }>;
}

interface GitHubReviewCommentResponse {
  body?: string;
  html_url?: string;
  created_at?: string;
  path?: string;
  line?: number;
  user?: { login?: string };
}

/**
 * GitHub SCM provider implementation.
 */
export class GitHubScmProvider implements ScmProvider {
  readonly type: ScmProviderType = 'github';

  /**
   * @param repoUrl Repository URL.
   * @returns Normalized repository reference.
   */
  parseRepository(repoUrl: string): ScmRepositoryRef {
    const parts = this.parseGitHubRepo(repoUrl);
    return {
      provider: this.type,
      repoUrl,
      displayName: `${parts.owner}/${parts.repo}`,
    };
  }

  /**
   * @param repoUrl Repository URL.
   * @param token Optional auth token.
   * @returns Clean clone URL.
   */
  buildAuthenticatedRepoUrl(repoUrl: string, token?: string): string {
    let parsed: URL;
    try {
      parsed = new URL(repoUrl);
    } catch {
      return repoUrl;
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
      return repoUrl;
    }

    const parts = this.parseGitHubRepo(repoUrl);
    // Return clean URL without credentials.
    return `https://github.com/${parts.owner}/${parts.repo}.git`;
  }

  /**
   * @param token Auth token.
   * @returns Git config flags for non-interactive auth.
   */
  getGitAuthConfig(token?: string): string[] {
    const normalizedToken = this.normalizeToken(token);
    if (!normalizedToken) {
      return [];
    }

    // Using url.insteadOf is the most robust way to inject credentials into a git
    // command non-interactively on all platforms (including Windows).
    // This rewrites the URL in memory for the duration of the command.
    // We use x-access-token as the username for all GitHub token types.
    return [
      '-c',
      `url.https://x-access-token:${normalizedToken}@github.com/.insteadOf=https://github.com/`
    ];
  }

  /**
   * @param input Pull request creation input.
   * @returns Created pull request details.
   */
  async createPullRequest(input: CreatePullRequestInput): Promise<PullRequestInfo> {
    const token = this.requireToken(input.token);
    const parts = this.parseGitHubRepo(input.repo.repoUrl);

    const response = await requestJson<GitHubPullResponse>(
      `https://api.github.com/repos/${parts.owner}/${parts.repo}/pulls`,
      {
        method: 'POST',
        headers: this.buildAuthHeaders(token),
        body: {
          title: input.title,
          body: input.description || '',
          head: input.sourceBranch,
          base: input.targetBranch,
        },
      }
    );

    return {
      id: String(response.number),
      number: response.number,
      url: response.html_url,
      title: response.title,
      sourceBranch: response.head.ref,
      targetBranch: response.base.ref,
    };
  }

  /**
   * @param input Pull request feedback input.
   * @returns Failed check/status entries.
   */
  async listPipelineFailures(input: PullRequestFeedbackInput): Promise<PipelineFailureInfo[]> {
    const token = this.requireToken(input.token);
    const parts = this.parseGitHubRepo(input.repo.repoUrl);
    const prNumber = input.pullRequest.number;

    const pull = await requestJson<GitHubPullResponse>(
      `https://api.github.com/repos/${parts.owner}/${parts.repo}/pulls/${prNumber}`,
      {
        headers: this.buildAuthHeaders(token),
      }
    );

    const checkRuns = await requestJson<GitHubCheckRunsResponse>(
      `https://api.github.com/repos/${parts.owner}/${parts.repo}/commits/${pull.head.sha}/check-runs`,
      {
        headers: {
          ...this.buildAuthHeaders(token),
          Accept: 'application/vnd.github+json',
        },
      }
    );

    const statuses = await requestJson<GitHubCommitStatusResponse>(
      `https://api.github.com/repos/${parts.owner}/${parts.repo}/commits/${pull.head.sha}/status`,
      {
        headers: this.buildAuthHeaders(token),
      }
    );

    const failedChecks: PipelineFailureInfo[] = (checkRuns.check_runs || [])
      .filter((run) => {
        const conclusion = (run.conclusion || '').toLowerCase();
        return Boolean(conclusion && conclusion !== 'success' && conclusion !== 'neutral' && conclusion !== 'skipped');
      })
      .map((run) => ({
        provider: this.type,
        source: 'check-run',
        name: run.name || 'unknown-check',
        status: run.conclusion || run.status || 'unknown',
        url: run.details_url || run.html_url,
      }));

    const failedStatuses: PipelineFailureInfo[] = (statuses.statuses || [])
      .filter((status) => {
        const state = (status.state || '').toLowerCase();
        return state === 'failure' || state === 'error';
      })
      .map((status) => ({
        provider: this.type,
        source: 'commit-status',
        name: status.context || 'status-check',
        status: status.state || 'unknown',
        url: status.target_url,
        details: status.description,
      }));

    return [...failedChecks, ...failedStatuses];
  }

  /**
   * @param input Pull request feedback input.
   * @returns Review comments for the pull request.
   */
  async listReviewComments(input: PullRequestFeedbackInput): Promise<ReviewCommentInfo[]> {
    const token = this.requireToken(input.token);
    const parts = this.parseGitHubRepo(input.repo.repoUrl);

    const comments = await requestJson<GitHubReviewCommentResponse[]>(
      `https://api.github.com/repos/${parts.owner}/${parts.repo}/pulls/${input.pullRequest.number}/comments?per_page=100`,
      {
        headers: this.buildAuthHeaders(token),
      }
    );

    return comments
      .filter((comment) => Boolean(comment.body && comment.body.trim()))
      .map((comment) => ({
        provider: this.type,
        author: comment.user?.login,
        body: comment.body || '',
        filePath: comment.path,
        line: comment.line,
        createdAt: comment.created_at,
        url: comment.html_url,
      }));
  }

  private parseGitHubRepo(repoUrl: string): GitHubRepoParts {
    const sshMatch = /^git@github\.com:(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/i.exec(repoUrl);
    if (sshMatch?.groups?.owner && sshMatch.groups.repo) {
      return {
        owner: sshMatch.groups.owner,
        repo: sshMatch.groups.repo,
      };
    }

    const parsed = new URL(repoUrl);
    if (parsed.hostname !== 'github.com') {
      throw new Error(`Invalid GitHub repository URL: ${repoUrl}`);
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 2) {
      throw new Error(`Invalid GitHub repository URL: ${repoUrl}`);
    }

    return {
      owner: segments[0],
      repo: segments[1].replace(/\.git$/i, ''),
    };
  }

  private buildAuthHeaders(token: string): Record<string, string> {
    const normalizedToken = this.normalizeToken(token);
    if (!normalizedToken) {
      throw new Error('GitHub token is required for SCM API operations');
    }
    return {
      Authorization: `Bearer ${normalizedToken}`,
      'User-Agent': 'runnly-ai-scm',
      Accept: 'application/vnd.github+json',
    };
  }

  private requireToken(token?: string): string {
    const normalizedToken = this.normalizeToken(token);
    if (!normalizedToken) {
      throw new Error('GitHub token is required for SCM API operations');
    }
    return normalizedToken;
  }

  private normalizeToken(token?: string): string | undefined {
    if (!token) {
      return undefined;
    }
    const trimmed = token.trim();
    if (!trimmed) {
      return undefined;
    }

    return trimmed.replace(/^Bearer\s+/i, '');
  }
}
