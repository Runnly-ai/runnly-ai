import { getToolCatalog } from '../tools';
import { AgentToolName } from '../agents/providers/agent-tools';
import { SkillFrontmatter, SkillMetadata } from './types';

const TOOL_NAMES = new Set(getToolCatalog().map((tool) => tool.name));

export interface SkillToolPolicy {
  allowedTools: string[];
  disallowedTools: string[];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

/**
 * Applies a skill's declared tool access against the runtime tool catalog.
 */
export function resolveSkillToolPolicy(
  metadata: Pick<SkillMetadata, 'tools' | 'disallowedTools'> | SkillFrontmatter | undefined
): SkillToolPolicy {
  const requestedTools = metadata?.tools || [];
  const deniedTools = metadata?.disallowedTools || [];

  const allowedTools = requestedTools.length > 0
    ? requestedTools.filter(
        (tool): tool is AgentToolName => TOOL_NAMES.has(tool as AgentToolName) && !deniedTools.includes(tool)
      )
    : [];

  return {
    allowedTools: unique(allowedTools),
    disallowedTools: unique(deniedTools.filter((tool) => TOOL_NAMES.has(tool as AgentToolName))),
  };
}
