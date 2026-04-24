import { createHmac, timingSafeEqual } from 'node:crypto';
import { EventService } from '../../event';
import { createId } from '../../utils';
import { PullRequestBindingRepo } from '../bindings/types';
import { PipelineFailureInfo, ReviewCommentInfo, ScmProviderType } from '../types/scm';
import { Logger } from '../../utils/logger';

interface WebhookInput {
  provider: ScmProviderType;
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
  body: unknown;
}

interface ScmWebhookServiceOptions {
  githubWebhookSecret?: string;
  azureDevOpsWebhookSecret?: string;
}

interface WebhookNormalizationResult {
  eventType: 'SCM_PIPELINE_FAILED' | 'SCM_REVIEW_COMMENT_ADDED' | 'SCM_PIPELINE_PASSED' | null;
  repositoryCandidates: string[];
  pullRequestNumber: number;
  payload: Record<string, unknown>;
}

/**
 * Receives provider webhook payloads, verifies signatures, maps them to internal SCM events.
 */
export class ScmWebhookService {
  private readonly seenDeliveries = new Set<string>();

  constructor(
    private readonly deps: {
      eventService: EventService;
      bindingRepo: PullRequestBindingRepo;
      logger: Logger;
    },
    private readonly options: ScmWebhookServiceOptions
  ) {}

  /**
   * Handles one webhook request and emits correlated internal event if matched.
   */
  async handleWebhook(input: WebhookInput): Promise<{ accepted: boolean; reason?: string }> {
    if (!this.verifySignature(input)) {
      return { accepted: false, reason: 'Invalid webhook signature' };
    }

    const deliveryId = this.extractDeliveryId(input.provider, input.headers);
    if (deliveryId && this.seenDeliveries.has(deliveryId)) {
      return { accepted: true, reason: 'Duplicate delivery ignored' };
    }

    const normalized = this.normalize(input.provider, input.headers, input.body);
    if (!normalized || !normalized.eventType) {
      if (deliveryId) {
        this.seenDeliveries.add(deliveryId);
      }
      return { accepted: true, reason: 'No actionable SCM event in payload' };
    }

    const binding = await this.findBinding(input.provider, normalized.repositoryCandidates, normalized.pullRequestNumber);
    if (!binding) {
      this.deps.logger.info('scm webhook ignored: no session binding', {
        provider: input.provider,
        repositories: normalized.repositoryCandidates,
        pr: normalized.pullRequestNumber,
      });
      if (deliveryId) {
        this.seenDeliveries.add(deliveryId);
      }
      return { accepted: true, reason: 'No matching session binding' };
    }

    await this.deps.eventService.emit({
      sessionId: binding.sessionId,
      type: normalized.eventType,
      payload: {
        ...normalized.payload,
        provider: input.provider,
        repository: binding.repository,
        pullRequestNumber: normalized.pullRequestNumber,
        deliveryId,
      },
    });

    if (deliveryId) {
      this.seenDeliveries.add(deliveryId);
      if (this.seenDeliveries.size > 10000) {
        this.seenDeliveries.clear();
      }
    }

    return { accepted: true };
  }

  private async findBinding(
    provider: ScmProviderType,
    repositoryCandidates: string[],
    pullRequestNumber: number
  ) {
    for (const repository of repositoryCandidates) {
      const found = await this.deps.bindingRepo.find(provider, repository, pullRequestNumber);
      if (found) {
        return found;
      }
    }
    return null;
  }

  private normalize(
    provider: ScmProviderType,
    headers: Record<string, string | string[] | undefined>,
    body: unknown
  ): WebhookNormalizationResult | null {
    if (!body || typeof body !== 'object') {
      return null;
    }

    if (provider === 'github') {
      return this.normalizeGitHub(headers, body as Record<string, unknown>);
    }
    return this.normalizeAzureDevOps(body as Record<string, unknown>);
  }

  private normalizeGitHub(
    headers: Record<string, string | string[] | undefined>,
    body: Record<string, unknown>
  ): WebhookNormalizationResult | null {
    const eventName = this.header(headers, 'x-github-event');
    const repoFullName = this.readString((body.repository as Record<string, unknown> | undefined)?.full_name);
    if (!repoFullName) {
      return null;
    }

    const directPullRequestNumber = this.readNumber((body.pull_request as Record<string, unknown> | undefined)?.number);

    if (eventName === 'pull_request_review_comment') {
      const action = this.readString(body.action);
      if (action !== 'created') {
        return null;
      }
      const pullRequestNumber = directPullRequestNumber;
      if (!pullRequestNumber) {
        return null;
      }
      const comment = body.comment as Record<string, unknown> | undefined;
      const reviewComment: ReviewCommentInfo = {
        provider: 'github',
        author: this.readString((comment?.user as Record<string, unknown> | undefined)?.login),
        body: this.readString(comment?.body) || '',
        filePath: this.readString(comment?.path),
        line: this.readNumber(comment?.line),
        createdAt: this.readString(comment?.created_at),
        url: this.readString(comment?.html_url),
      };

      if (!reviewComment.body.trim()) {
        return null;
      }

      return {
        eventType: 'SCM_REVIEW_COMMENT_ADDED',
        repositoryCandidates: [repoFullName.toLowerCase()],
        pullRequestNumber,
        payload: { comments: [reviewComment] },
      };
    }

    if (eventName === 'check_run') {
      const action = this.readString(body.action);
      if (action !== 'completed') {
        return null;
      }
      const checkRun = body.check_run as Record<string, unknown> | undefined;
      const pullRequestNumber =
        directPullRequestNumber || this.readGitHubPullRequestNumberFromArray(checkRun?.pull_requests);
      if (!pullRequestNumber) {
        return null;
      }
      const conclusion = (this.readString(checkRun?.conclusion) || '').toLowerCase();
      const status = this.readString(checkRun?.status) || conclusion || 'unknown';
      const failure: PipelineFailureInfo = {
        provider: 'github',
        source: 'check-run',
        name: this.readString(checkRun?.name) || 'check-run',
        status,
        url: this.readString(checkRun?.details_url) || this.readString(checkRun?.html_url),
      };

      if (!conclusion || conclusion === 'success' || conclusion === 'neutral' || conclusion === 'skipped') {
        return {
          eventType: 'SCM_PIPELINE_PASSED',
          repositoryCandidates: [repoFullName.toLowerCase()],
          pullRequestNumber,
          payload: {},
        };
      }

      return {
        eventType: 'SCM_PIPELINE_FAILED',
        repositoryCandidates: [repoFullName.toLowerCase()],
        pullRequestNumber,
        payload: { failures: [failure] },
      };
    }

    if (eventName === 'workflow_run') {
      const action = this.readString(body.action);
      if (action !== 'completed') {
        return null;
      }
      const workflowRun = body.workflow_run as Record<string, unknown> | undefined;
      const pullRequestNumber =
        directPullRequestNumber || this.readGitHubPullRequestNumberFromArray(workflowRun?.pull_requests);
      if (!pullRequestNumber) {
        return null;
      }
      const conclusion = (this.readString(workflowRun?.conclusion) || '').toLowerCase();
      if (!conclusion) {
        return null;
      }

      if (conclusion === 'success') {
        return {
          eventType: 'SCM_PIPELINE_PASSED',
          repositoryCandidates: [repoFullName.toLowerCase()],
          pullRequestNumber,
          payload: {},
        };
      }

      const failure: PipelineFailureInfo = {
        provider: 'github',
        source: 'workflow-run',
        name: this.readString(workflowRun?.name) || 'workflow',
        status: conclusion,
        url: this.readString(workflowRun?.html_url),
      };

      return {
        eventType: 'SCM_PIPELINE_FAILED',
        repositoryCandidates: [repoFullName.toLowerCase()],
        pullRequestNumber,
        payload: { failures: [failure] },
      };
    }

    return null;
  }

  private readGitHubPullRequestNumberFromArray(value: unknown): number | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }
    for (const item of value) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const number = this.readNumber((item as Record<string, unknown>).number);
      if (number) {
        return number;
      }
    }
    return undefined;
  }

  private normalizeAzureDevOps(body: Record<string, unknown>): WebhookNormalizationResult | null {
    const eventType = this.readString(body.eventType) || this.readString(body.type);
    const resource = body.resource as Record<string, unknown> | undefined;
    if (!resource) {
      return null;
    }

    const pullRequestNumber =
      this.readNumber(resource.pullRequestId) ||
      this.readNumber((resource.pullRequest as Record<string, unknown> | undefined)?.pullRequestId);
    if (!pullRequestNumber) {
      return null;
    }

    const repository = (resource.repository || (resource.pullRequest as Record<string, unknown> | undefined)?.repository) as
      | Record<string, unknown>
      | undefined;
    const repoName = this.readString(repository?.name);
    const projectName = this.readString((repository?.project as Record<string, unknown> | undefined)?.name);
    const orgFromCollection = this.extractAzureOrganization(body);

    const repositoryCandidates = [
      [orgFromCollection, projectName, repoName].filter(Boolean).join('/').toLowerCase(),
      [projectName, repoName].filter(Boolean).join('/').toLowerCase(),
    ].filter(Boolean);

    if (eventType && eventType.toLowerCase().includes('comment')) {
      const comments = this.collectAzureComments(resource);
      if (comments.length === 0) {
        return null;
      }
      return {
        eventType: 'SCM_REVIEW_COMMENT_ADDED',
        repositoryCandidates,
        pullRequestNumber,
        payload: { comments },
      };
    }

    const statusText = (this.readString(resource.status) || this.readString(resource.result) || '').toLowerCase();
    if (!statusText) {
      return null;
    }

    if (statusText.includes('success') || statusText.includes('succeeded')) {
      return {
        eventType: 'SCM_PIPELINE_PASSED',
        repositoryCandidates,
        pullRequestNumber,
        payload: {},
      };
    }

    if (statusText.includes('fail') || statusText.includes('error') || statusText.includes('rejected')) {
      const failure: PipelineFailureInfo = {
        provider: 'azure-devops',
        source: eventType || 'azure-webhook',
        name: this.readString(resource.title) || this.readString(resource.name) || 'pipeline',
        status: statusText,
        url: this.readString(resource.url),
        details: this.readString((body.detailedMessage as Record<string, unknown> | undefined)?.text),
      };

      return {
        eventType: 'SCM_PIPELINE_FAILED',
        repositoryCandidates,
        pullRequestNumber,
        payload: { failures: [failure] },
      };
    }

    return null;
  }

  private collectAzureComments(resource: Record<string, unknown>): ReviewCommentInfo[] {
    const comments: ReviewCommentInfo[] = [];
    const thread = resource.thread as Record<string, unknown> | undefined;
    const threadComments = (thread?.comments || resource.comments) as unknown;
    if (!Array.isArray(threadComments)) {
      return comments;
    }

    for (const rawComment of threadComments) {
      if (!rawComment || typeof rawComment !== 'object') {
        continue;
      }
      const comment = rawComment as Record<string, unknown>;
      const body = this.readString(comment.content) || '';
      if (!body.trim()) {
        continue;
      }
      comments.push({
        provider: 'azure-devops',
        author: this.readString((comment.author as Record<string, unknown> | undefined)?.displayName),
        body,
        createdAt: this.readString(comment.publishedDate),
      });
    }

    return comments;
  }

  private extractAzureOrganization(body: Record<string, unknown>): string {
    const containers = body.resourceContainers as Record<string, unknown> | undefined;
    const collection = containers?.collection as Record<string, unknown> | undefined;
    const baseUrl = this.readString(collection?.baseUrl);
    if (!baseUrl) {
      return '';
    }
    try {
      const parsed = new URL(baseUrl);
      const segments = parsed.pathname.split('/').filter(Boolean);
      return segments[0] || '';
    } catch {
      return '';
    }
  }

  private verifySignature(input: WebhookInput): boolean {
    if (input.provider === 'github') {
      if (!this.options.githubWebhookSecret) {
        return true;
      }
      const expected = `sha256=${createHmac('sha256', this.options.githubWebhookSecret).update(input.rawBody).digest('hex')}`;
      const actual = this.header(input.headers, 'x-hub-signature-256');
      return this.safeEqual(expected, actual || '');
    }

    if (!this.options.azureDevOpsWebhookSecret) {
      return true;
    }
    const hmacHex = createHmac('sha256', this.options.azureDevOpsWebhookSecret).update(input.rawBody).digest('hex');
    const hmacBase64 = createHmac('sha256', this.options.azureDevOpsWebhookSecret).update(input.rawBody).digest('base64');
    const actual =
      this.header(input.headers, 'x-vss-signature') ||
      this.header(input.headers, 'x-azure-signature') ||
      this.header(input.headers, 'x-hub-signature-256') ||
      '';

    const normalizedActual = actual.startsWith('sha256=') ? actual : `sha256=${actual}`;
    return this.safeEqual(`sha256=${hmacHex}`, normalizedActual) || this.safeEqual(hmacBase64, actual);
  }

  private extractDeliveryId(
    provider: ScmProviderType,
    headers: Record<string, string | string[] | undefined>
  ): string {
    if (provider === 'github') {
      return this.header(headers, 'x-github-delivery') || createId('gh-delivery');
    }
    return this.header(headers, 'x-vss-deliveryid') || this.header(headers, 'x-request-id') || createId('azdo-delivery');
  }

  private header(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }

  private readString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  private readNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }

  private safeEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) {
      return false;
    }
    return timingSafeEqual(aBuf, bBuf);
  }
}
