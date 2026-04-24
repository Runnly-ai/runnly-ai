import { SkillRegistry } from './skill-registry';
import { loadMarkdownSkillManifests } from './markdown-skill-loader';
import { Logger } from '../../utils/logger';

/**
 * Creates the default lazy-loaded skill registry.
 */
export async function createDefaultSkillRegistry({
  skillsDir,
  logger,
}: {
  skillsDir?: string;
  logger?: Logger;
} = {}): Promise<SkillRegistry> {
  const markdownManifests = skillsDir ? await loadMarkdownSkillManifests(skillsDir, logger) : [];
  return new SkillRegistry([
    ...markdownManifests,
    {
      id: 'plan-skill',
      title: 'Built-in Plan Skill',
      description: 'Default fallback planning skill when no custom SKILL.md is selected.',
      loader: async () => (await import('./plan-skill')).default,
    },
    {
      id: 'test-skill',
      title: 'Built-in Test Skill',
      description: 'Default fallback test skill with simple pass/fail simulation.',
      loader: async () => (await import('./test-skill')).default,
    },
    {
      id: 'review-skill',
      title: 'Built-in Review Skill',
      description: 'Default fallback review completion skill.',
      loader: async () => (await import('./review-skill')).default,
    },
  ]);
}
