import { AgentProvider, AgentProviderId, AgentProviderRunInput, AgentProviderRunResult } from '../types/agent-provider';

/**
 * Resolves provider selection per role/command and executes provider runs.
 */
export class AgentProviderRouter {
  constructor(
    private readonly providers: Map<AgentProviderId, AgentProvider>,
    private readonly defaultProvider: AgentProviderId
  ) {}

  run(providerId: AgentProviderId | undefined, input: AgentProviderRunInput): Promise<AgentProviderRunResult> {
    const id = providerId || this.defaultProvider;
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Unknown agent provider: ${id}`);
    }
    return provider.run(input);
  }
}
