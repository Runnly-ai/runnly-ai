import { Logger } from '../../utils/logger';
import { loadMarkdownSkillManifests } from './loader';
import { SkillRegistry } from './skill-registry';
import path from 'node:path';

function resolveSkillRoots(explicitRoot?: string): string[] {
  const configured = explicitRoot || process.env.AGENT_SKILLS_DIR || '';
  if (!configured.trim()) {
    return [];
  }
  return configured
    .split(path.delimiter)
    .map((root) => root.trim())
    .filter(Boolean);
}

/**
 * Creates the default skill registry from markdown skills plus built-ins.
 */
export async function createDefaultSkillRegistry({
  skillsDir,
  logger,
}: {
  skillsDir?: string;
  logger?: Logger;
} = {}): Promise<SkillRegistry> {
  const markdownManifests = [];
  for (const root of resolveSkillRoots(skillsDir)) {
    markdownManifests.push(...(await loadMarkdownSkillManifests(root, logger)));
  }
  return new SkillRegistry(markdownManifests);
}

