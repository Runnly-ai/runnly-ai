import { detectScmProvider, ScmProviderType } from '../../scm/types/scm';

export interface SessionScmWorkspace {
  rootDir: string;
  repoDir: string;
  worktreeDir: string;
  branch: string;
  baseBranch: string;
}

export interface SessionScmPullRequest {
  id: string;
  number: number;
  url: string;
  sourceBranch?: string;
  targetBranch?: string;
}

export interface SessionScmPublish {
  changed: boolean;
  pullRequest?: SessionScmPullRequest;
  pipelineFailures?: unknown[];
  reviewComments?: unknown[];
  [key: string]: unknown;
}

export interface SessionScmContext {
  provider: ScmProviderType;
  repoUrl: string;
  baseBranch?: string;
  token?: string;
  commitMessage?: string;
  prTitle?: string;
  prDescription?: string;
  workspace?: SessionScmWorkspace;
  publish?: SessionScmPublish;
  [key: string]: unknown;
}

export interface SessionContext {
  scm?: SessionScmContext;
  requirements?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  extras?: Record<string, unknown>;
  [key: string]: unknown;
}

export function normalizeSessionContext(value: unknown): SessionContext {
  const base = asRecord(value) || {};
  const context: SessionContext = { ...base };

  const scm = normalizeScmContext(base.scm, base);
  if (scm) {
    context.scm = scm;
  } else {
    delete context.scm;
  }

  const requirements = asRecord(base.requirements);
  if (requirements) {
    context.requirements = requirements;
  } else {
    delete context.requirements;
  }

  const constraints = asRecord(base.constraints);
  if (constraints) {
    context.constraints = constraints;
  } else {
    delete context.constraints;
  }

  const metadata = asRecord(base.metadata);
  if (metadata) {
    context.metadata = metadata;
  } else {
    delete context.metadata;
  }

  const extras = asRecord(base.extras);
  if (extras) {
    context.extras = extras;
  } else {
    delete context.extras;
  }

  return context;
}

function normalizeScmContext(value: unknown, root: Record<string, unknown>): SessionScmContext | undefined {
  if (typeof value === 'string') {
    const repoUrl = cleanString(value);
    if (!repoUrl) {
      return undefined;
    }
    const provider = detectScmProvider(repoUrl);
    if (!provider) {
      return undefined;
    }
    return { provider, repoUrl };
  }

  const record = asRecord(value);
  const candidate = record || root;
  const repoUrl = resolveRepoUrl(candidate);
  if (!repoUrl) {
    return undefined;
  }

  const explicitProvider = cleanString(candidate.provider);
  const provider = toScmProvider(explicitProvider) || detectScmProvider(repoUrl);
  if (!provider) {
    return undefined;
  }

  const normalized: SessionScmContext = {
    ...candidate,
    provider,
    repoUrl,
  };

  const baseBranch = cleanString(candidate.baseBranch);
  if (baseBranch) {
    normalized.baseBranch = baseBranch;
  } else {
    delete normalized.baseBranch;
  }

  const token = cleanString(candidate.token);
  if (token) {
    normalized.token = token;
  } else {
    delete normalized.token;
  }

  const commitMessage = cleanString(candidate.commitMessage);
  if (commitMessage) {
    normalized.commitMessage = commitMessage;
  } else {
    delete normalized.commitMessage;
  }

  const prTitle = cleanString(candidate.prTitle);
  if (prTitle) {
    normalized.prTitle = prTitle;
  } else {
    delete normalized.prTitle;
  }

  const prDescription = cleanString(candidate.prDescription);
  if (prDescription) {
    normalized.prDescription = prDescription;
  } else {
    delete normalized.prDescription;
  }

  const workspace = normalizeWorkspace(candidate.workspace);
  if (workspace) {
    normalized.workspace = workspace;
  } else {
    delete normalized.workspace;
  }

  const publish = asRecord(candidate.publish);
  if (publish) {
    normalized.publish = publish as SessionScmPublish;
  } else {
    delete normalized.publish;
  }

  return normalized;
}

function normalizeWorkspace(value: unknown): SessionScmWorkspace | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const rootDir = cleanString(record.rootDir);
  const repoDir = cleanString(record.repoDir);
  const worktreeDir = cleanString(record.worktreeDir);
  const branch = cleanString(record.branch);
  const baseBranch = cleanString(record.baseBranch);
  if (!rootDir || !repoDir || !worktreeDir || !branch || !baseBranch) {
    return undefined;
  }

  return {
    rootDir,
    repoDir,
    worktreeDir,
    branch,
    baseBranch,
  };
}

function resolveRepoUrl(record: Record<string, unknown>): string {
  const candidates = [record.repoUrl, record.repositoryUrl, record.url, record.repo];
  for (const value of candidates) {
    const clean = cleanString(value);
    if (clean) {
      return clean;
    }
  }
  return '';
}

function toScmProvider(value: string): ScmProviderType | undefined {
  if (value === 'github' || value === 'azure-devops') {
    return value;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
