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
import { requestJson, toBasicTokenAuth } from './http';

interface AzureRepoParts {
  organization: string;
  project: string;
  repository: string;
}

interface AzurePullRequestResponse {
  pullRequestId: number;
  title?: string;
  url?: string;
  sourceRefName?: string;
  targetRefName?: string;
}

interface AzurePullRequestStatusesResponse {
  value?: Array<{
    state?: string;
    description?: string;
    targetUrl?: string;
    context?: {
      name?: string;
      genre?: string;
    };
  }>;
}

interface AzurePullRequestThreadsResponse {
  value?: Array<{
    threadContext?: {
      filePath?: string;
      rightFileStart?: {
        line?: number;
      };
    };
    comments?: Array<{
      content?: string;
      publishedDate?: string;
      author?: {
        displayName?: string;
      };
    }>;
    _links?: {
      web?: {
        href?: string;
      };
    };
  }>;
}

/**
 * Azure DevOps SCM provider implementation.
 */
export class AzureDevOpsScmProvider implements ScmProvider {
  readonly type: ScmProviderType = 'azure-devops';

  /**
   * @param repoUrl Repository URL.
   * @returns Normalized repository reference.
   */
  parseRepository(repoUrl: string): ScmRepositoryRef {
    const parts = this.parseAzureRepo(repoUrl);
    return {
      provider: this.type,
      repoUrl,
      displayName: `${parts.organization}/${parts.project}/${parts.repository}`,
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
    if (parsed.protocol !== 'https:') {
      return repoUrl;
    }

    // Return clean URL without credentials.
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
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

    // Using url.insteadOf for Azure DevOps to ensure non-interactive authentication.
    // This is the most robust method for Windows.
    // We use "azdo" as the username for Azure DevOps PATs.
    return [
      '-c',
      `url.https://azdo:${normalizedToken}@dev.azure.com/.insteadOf=https://dev.azure.com/`
    ];
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

  /**
   * @param input Pull request creation input.
   * @returns Created pull request details.
   */
  async createPullRequest(input: CreatePullRequestInput): Promise<PullRequestInfo> {
    const token = this.requireToken(input.token);
    const parts = this.parseAzureRepo(input.repo.repoUrl);
    const apiBase = this.apiBase(parts);

    const response = await requestJson<AzurePullRequestResponse>(
      `${apiBase}/git/repositories/${encodeURIComponent(parts.repository)}/pullrequests?api-version=7.1`,
      {
        method: 'POST',
        headers: {
          Authorization: toBasicTokenAuth(token),
        },
        body: {
          sourceRefName: `refs/heads/${input.sourceBranch}`,
          targetRefName: `refs/heads/${input.targetBranch}`,
          title: input.title,
          description: input.description || '',
        },
      }
    );

    return {
      id: String(response.pullRequestId),
      number: response.pullRequestId,
      url: response.url || this.webPullRequestUrl(parts, response.pullRequestId),
      title: response.title || input.title,
      sourceBranch: this.cleanRef(response.sourceRefName) || input.sourceBranch,
      targetBranch: this.cleanRef(response.targetRefName) || input.targetBranch,
    };
  }

  /**
   * @param input Pull request feedback input.
   * @returns Failed pipeline/check entries.
   */
  async listPipelineFailures(input: PullRequestFeedbackInput): Promise<PipelineFailureInfo[]> {
    const token = this.requireToken(input.token);
    const parts = this.parseAzureRepo(input.repo.repoUrl);
    const apiBase = this.apiBase(parts);

    const response = await requestJson<AzurePullRequestStatusesResponse>(
      `${apiBase}/git/repositories/${encodeURIComponent(parts.repository)}/pullRequests/${input.pullRequest.number}/statuses?api-version=7.1-preview.1`,
      {
        headers: {
          Authorization: toBasicTokenAuth(token),
        },
      }
    );

    return (response.value || [])
      .filter((status) => {
        const state = (status.state || '').toLowerCase();
        return state !== 'succeeded' && state !== 'success' && state !== 'notset';
      })
      .map((status) => ({
        provider: this.type,
        source: status.context?.genre || 'pr-status',
        name: status.context?.name || 'status',
        status: status.state || 'unknown',
        url: status.targetUrl,
        details: status.description,
      }));
  }

  /**
   * @param input Pull request feedback input.
   * @returns Review comments across PR threads.
   */
  async listReviewComments(input: PullRequestFeedbackInput): Promise<ReviewCommentInfo[]> {
    const token = this.requireToken(input.token);
    const parts = this.parseAzureRepo(input.repo.repoUrl);
    const apiBase = this.apiBase(parts);

    const response = await requestJson<AzurePullRequestThreadsResponse>(
      `${apiBase}/git/repositories/${encodeURIComponent(parts.repository)}/pullRequests/${input.pullRequest.number}/threads?api-version=7.1`,
      {
        headers: {
          Authorization: toBasicTokenAuth(token),
        },
      }
    );

    const comments: ReviewCommentInfo[] = [];
    for (const thread of response.value || []) {
      const filePath = thread.threadContext?.filePath;
      const line = thread.threadContext?.rightFileStart?.line;
      const url = thread._links?.web?.href;

      for (const comment of thread.comments || []) {
        if (!comment.content || !comment.content.trim()) {
          continue;
        }
        comments.push({
          provider: this.type,
          author: comment.author?.displayName,
          body: comment.content,
          filePath,
          line,
          createdAt: comment.publishedDate,
          url,
        });
      }
    }

    return comments;
  }

  private parseAzureRepo(repoUrl: string): AzureRepoParts {
    const parsed = new URL(repoUrl);

    if (parsed.hostname === 'dev.azure.com') {
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length < 4 || segments[2] !== '_git') {
        throw new Error(`Invalid Azure DevOps repository URL: ${repoUrl}`);
      }
      return {
        organization: segments[0],
        project: decodeURIComponent(segments[1]),
        repository: decodeURIComponent(segments[3].replace(/\.git$/i, '')),
      };
    }

    if (parsed.hostname.endsWith('.visualstudio.com')) {
      const organization = parsed.hostname.split('.')[0];
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length < 3 || segments[1] !== '_git') {
        throw new Error(`Invalid Azure DevOps repository URL: ${repoUrl}`);
      }
      return {
        organization,
        project: decodeURIComponent(segments[0]),
        repository: decodeURIComponent(segments[2].replace(/\.git$/i, '')),
      };
    }

    throw new Error(`Invalid Azure DevOps repository URL: ${repoUrl}`);
  }

  private apiBase(parts: AzureRepoParts): string {
    return `https://dev.azure.com/${encodeURIComponent(parts.organization)}/${encodeURIComponent(parts.project)}/_apis`;
  }

  private webPullRequestUrl(parts: AzureRepoParts, pullRequestId: number): string {
    return `https://dev.azure.com/${encodeURIComponent(parts.organization)}/${encodeURIComponent(parts.project)}/_git/${encodeURIComponent(parts.repository)}/pullrequest/${pullRequestId}`;
  }

  private cleanRef(ref?: string): string {
    if (!ref) {
      return '';
    }
    return ref.replace(/^refs\/heads\//, '');
  }

  private requireToken(token?: string): string {
    if (!token) {
      throw new Error('Azure DevOps token is required for SCM API operations');
    }
    return token;
  }
}
