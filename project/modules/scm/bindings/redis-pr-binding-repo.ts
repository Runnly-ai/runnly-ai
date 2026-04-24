import { createClient, RedisClientType } from 'redis';
import { PullRequestBindingRepo, PullRequestSessionBinding } from './types';
import { ScmProviderType } from '../types/scm';

/**
 * Redis-backed PR binding repository.
 */
export class RedisPullRequestBindingRepo implements PullRequestBindingRepo {
  private readonly client: RedisClientType;
  private readonly keyPrefix: string;

  constructor(
    private readonly redisUrl: string,
    keyPrefix: string
  ) {
    this.client = createClient({ url: this.redisUrl });
    this.keyPrefix = keyPrefix;
  }

  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async upsert(binding: PullRequestSessionBinding): Promise<PullRequestSessionBinding> {
    await this.client.set(this.bindingKey(binding.provider, binding.repository, binding.pullRequestNumber), JSON.stringify(binding));
    return binding;
  }

  async find(provider: ScmProviderType, repository: string, pullRequestNumber: number): Promise<PullRequestSessionBinding | null> {
    const raw = await this.client.get(this.bindingKey(provider, repository, pullRequestNumber));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as PullRequestSessionBinding;
  }

  async close(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  private bindingKey(provider: ScmProviderType, repository: string, pullRequestNumber: number): string {
    return `${this.keyPrefix}:scm:prbinding:${provider}:${repository.toLowerCase()}:${pullRequestNumber}`;
  }
}
