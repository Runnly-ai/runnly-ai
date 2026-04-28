import { SkillMetadata } from './types';

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Finds the best matching skill from metadata using explicit ids and keyword overlap.
 */
export function matchSkill(
  query: string,
  candidates: SkillMetadata[],
  explicitSkillId?: string
): SkillMetadata | null {
  if (candidates.length === 0) {
    return null;
  }

  if (explicitSkillId) {
    const byId = candidates.find((candidate) => candidate.id === explicitSkillId);
    if (byId) {
      return byId;
    }
  }

  const normalizedQuery = normalize(query);
  let best: SkillMetadata | null = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    const haystack = normalize([candidate.id, candidate.title, candidate.description].join(' '));
    let score = 0;
    for (const token of normalizedQuery.split(' ')) {
      if (!token) {
        continue;
      }
      if (haystack.includes(token)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best || candidates[0] || null;
}

