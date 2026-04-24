import { PullRequestBindingRepo, PullRequestSessionBinding } from './types';
import { ScmProviderType } from '../types/scm';

/**
 * In-memory PR binding repository.
 */
export class InMemoryPullRequestBindingRepo implements PullRequestBindingRepo {
  private readonly bindings = new Map<string, PullRequestSessionBinding>();

  async connect(): Promise<void> {}

  async upsert(binding: PullRequestSessionBinding): Promise<PullRequestSessionBinding> {
    this.bindings.set(this.key(binding.provider, binding.repository, binding.pullRequestNumber), binding);
    return binding;
  }

  async find(provider: ScmProviderType, repository: string, pullRequestNumber: number): Promise<PullRequestSessionBinding | null> {
    return this.bindings.get(this.key(provider, repository, pullRequestNumber)) || null;
  }

  async close(): Promise<void> {
    this.bindings.clear();
  }

  private key(provider: ScmProviderType, repository: string, pullRequestNumber: number): string {
    return `${provider}|${repository.toLowerCase()}|${pullRequestNumber}`;
  }
}
