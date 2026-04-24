import { ScmProviderType } from '../types/scm';

export interface PullRequestSessionBinding {
  provider: ScmProviderType;
  repository: string;
  pullRequestNumber: number;
  sessionId: string;
  createdAt: number;
  updatedAt: number;
}

export interface PullRequestBindingRepo {
  connect(): Promise<void>;
  upsert(binding: PullRequestSessionBinding): Promise<PullRequestSessionBinding>;
  find(provider: ScmProviderType, repository: string, pullRequestNumber: number): Promise<PullRequestSessionBinding | null>;
  close(): Promise<void>;
}
