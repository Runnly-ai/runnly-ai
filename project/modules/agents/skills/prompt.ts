import { SkillMetadata } from './types';

/**
 * Builds a compact routing prompt for skill selection.
 */
export function buildSkillCatalogPrompt(
  candidates: SkillMetadata[],
  commandType: string,
  payload: unknown
): string {
  const catalog = candidates
    .map((skill, idx) => {
      const tools = skill.tools?.length ? `; tools=${skill.tools.join(',')}` : '';
      const dependencies = skill.skills?.length ? `; skills=${skill.skills.join(',')}` : '';
      const isolation = skill.isolation ? `; isolation=${skill.isolation}` : '';
      return `${idx + 1}. id=${skill.id}; name=${skill.title}; description=${skill.description}${tools}${dependencies}${isolation}`;
    })
    .join('\n');

  return [
    `Command type: ${commandType}`,
    `Command payload: ${JSON.stringify(payload)}`,
    '',
    'Skill catalog:',
    catalog,
    '',
    'Pick exactly one skill id. Return only the id.',
  ].join('\n');
}

/**
 * Builds execution instructions for a selected skill chain.
 */
export function buildSkillExecutionPrompt(chain: SkillMetadata[], commandType: string, payload: unknown): string {
  return [
    `Command type: ${commandType}`,
    `Command payload: ${JSON.stringify(payload)}`,
    '',
    'Selected skill chain:',
    chain
      .map((skill, idx) => {
        const tools = skill.tools?.length ? ` tools=${skill.tools.join(',')}` : '';
        const dependencies = skill.skills?.length ? ` dependencies=${skill.skills.join(',')}` : '';
        return `${idx + 1}. ${skill.id} (${skill.title})${tools}${dependencies}`;
      })
      .join('\n'),
    '',
    'Follow the chain in order. Use only the declared tools that are allowed by policy.',
  ].join('\n');
}

export function buildSkillToolPolicyPrompt(allowedTools: string[], disallowedTools: string[]): string {
  return [
    'Tool policy:',
    allowedTools.length > 0 ? `Allowed tools: ${allowedTools.join(', ')}` : 'Allowed tools: none',
    disallowedTools.length > 0 ? `Disallowed tools: ${disallowedTools.join(', ')}` : 'Disallowed tools: none',
    'Do not request or use any tool outside the allowed set.',
  ].join('\n');
}
