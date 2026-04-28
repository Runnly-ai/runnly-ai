import { SkillDocument, SkillFrontmatter } from './types';

function parseScalar(value: string): string | boolean | number {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric) && String(numeric) === trimmed) {
    return numeric;
  }
  return trimmed;
}

function normalizeArrayValue(value: string | boolean | number): string {
  return String(value);
}

function assignValue(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === 'tools' || key === 'disallowedtools' || key === 'skills' || key === 'hooks') {
    const normalized = Array.isArray(value)
      ? value.map(normalizeArrayValue)
      : typeof value === 'string' && value
        ? [value]
        : [];
    target[key] = normalized;
    return;
  }
  target[key] = value;
}

function parseFrontmatterBlock(block: string): SkillFrontmatter {
  const lines = block.replace(/\r\n/g, '\n').split('\n');
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ');
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }

    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch && currentKey) {
      const existing = Array.isArray(result[currentKey]) ? (result[currentKey] as string[]) : [];
      existing.push(String(parseScalar(listMatch[1])));
      result[currentKey] = existing;
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const rawValue = line.slice(separatorIndex + 1).trim();
    currentKey = key;

    if (!rawValue) {
      result[key] = [];
      continue;
    }

    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      const items = rawValue
        .slice(1, -1)
        .split(',')
        .map((item) => String(parseScalar(item)).trim())
        .filter(Boolean);
      result[key] = items;
      continue;
    }

    assignValue(result, key, parseScalar(rawValue));
  }

  return {
    id: typeof result.id === 'string' ? result.id : undefined,
    name: typeof result.name === 'string' ? result.name : undefined,
    title: typeof result.title === 'string' ? result.title : undefined,
    description: typeof result.description === 'string' ? result.description : undefined,
    tools: Array.isArray(result.tools) ? result.tools.map(String) : undefined,
    disallowedTools: Array.isArray(result.disallowedtools)
      ? result.disallowedtools.map(String)
      : undefined,
    skills: Array.isArray(result.skills) ? result.skills.map(String) : undefined,
    model: typeof result.model === 'string' ? result.model : undefined,
    memory: typeof result.memory === 'string' ? result.memory : undefined,
    hooks: Array.isArray(result.hooks) ? result.hooks.map(String) : undefined,
    isolation:
      result.isolation === 'inline' || result.isolation === 'subagent'
        ? (result.isolation as SkillFrontmatter['isolation'])
        : undefined,
  };
}

/**
 * Parses a markdown skill document with YAML-style frontmatter.
 */
export function parseSkillMarkdown(content: string): SkillDocument {
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return {
      sourcePath: '',
      frontmatter: {},
      body: normalized,
    };
  }

  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0) {
    return {
      sourcePath: '',
      frontmatter: {},
      body: normalized,
    };
  }

  const rawHeader = normalized.slice(4, end);
  const body = normalized.slice(end + 5).trimStart();
  return {
    sourcePath: '',
    frontmatter: parseFrontmatterBlock(rawHeader),
    body,
  };
}

