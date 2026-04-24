import { describe, it, expect, beforeEach } from 'vitest';
import { AgentRegistry } from '../registry';
import { Agent, AgentContext } from '../agents/types/agent';
import { Command } from '../../command';

class MockAgent extends Agent {
  async execute(_command: Command, _context: AgentContext): Promise<void> {
    // Mock implementation
  }
}

describe('AgentRegistry', () => {
  let planAgent: Agent;
  let generateAgent: Agent;
  let verifyAgent: Agent;
  let reviewAgent: Agent;

  beforeEach(() => {
    planAgent = new MockAgent('plan-agent', ['plan']);
    generateAgent = new MockAgent('generate-agent', ['generate']);
    verifyAgent = new MockAgent('verify-agent', ['verify']);
    reviewAgent = new MockAgent('review-agent', ['review']);
  });

  describe('resolve', () => {
    it('should resolve PLAN command to plan agent', () => {
      const registry = new AgentRegistry([planAgent, generateAgent]);

      const result = registry.resolve('PLAN');

      expect(result).toBe(planAgent);
    });

    it('should resolve GENERATE command to generate agent', () => {
      const registry = new AgentRegistry([planAgent, generateAgent]);

      const result = registry.resolve('GENERATE');

      expect(result).toBe(generateAgent);
    });

    it('should resolve FIX command to generate agent', () => {
      const registry = new AgentRegistry([planAgent, generateAgent]);

      const result = registry.resolve('FIX');

      expect(result).toBe(generateAgent);
    });

    it('should resolve VERIFY command to verify agent', () => {
      const registry = new AgentRegistry([verifyAgent]);

      const result = registry.resolve('VERIFY');

      expect(result).toBe(verifyAgent);
    });

    it('should resolve REVIEW command to review agent', () => {
      const registry = new AgentRegistry([reviewAgent]);

      const result = registry.resolve('REVIEW');

      expect(result).toBe(reviewAgent);
    });

    it('should return null when no agent has required capability', () => {
      const registry = new AgentRegistry([planAgent]);

      const result = registry.resolve('REVIEW');

      expect(result).toBeNull();
    });

    it('should return first matching agent when multiple have capability', () => {
      const agent1 = new MockAgent('agent-1', ['plan']);
      const agent2 = new MockAgent('agent-2', ['plan']);

      const registry = new AgentRegistry([agent1, agent2]);

      const result = registry.resolve('PLAN');

      expect(result).toBe(agent1);
    });

    it('should work with agent having multiple capabilities', () => {
      const multiAgent = new MockAgent('multi-agent', ['plan', 'generate', 'verify']);

      const registry = new AgentRegistry([multiAgent]);

      expect(registry.resolve('PLAN')).toBe(multiAgent);
      expect(registry.resolve('GENERATE')).toBe(multiAgent);
      expect(registry.resolve('VERIFY')).toBe(multiAgent);
    });

    it('should handle empty agent list', () => {
      const registry = new AgentRegistry([]);

      expect(registry.resolve('PLAN')).toBeNull();
      expect(registry.resolve('GENERATE')).toBeNull();
    });

    it('should handle agents with no matching capabilities', () => {
      const customAgent = new MockAgent('custom-agent', ['custom']);

      const registry = new AgentRegistry([customAgent]);

      expect(registry.resolve('PLAN')).toBeNull();
    });
  });
});
new MockAgent('custom-agent', ['custom'])