import fs from 'node:fs/promises';
import path from 'node:path';
import { Logger } from '../../utils/logger';
import { MarkdownSkillDefinition, SkillManifest } from './types';
import { MarkdownSkill } from './markdown-skill';

function sanitizeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-_/.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseFrontmatter(content: string): { attrs: Record<string, string>; body: string } {
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { attrs: {}, body: normalized };
  }
  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0) {
    return { attrs: {}, body: normalized };
  }
  const rawHeader = normalized.slice(4, end);
  const body = normalized.slice(end + 5);
  const attrs: Record<string, string> = {};
  for (const line of rawHeader.split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) {
      continue;
    }
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key) {
      attrs[key] = value;
    }
  }
  return { attrs, body };
}

function inferTitle(attrs: Record<string, string>, body: string, fallback: string): string {
  if (attrs.title) {
    return attrs.title;
  }
  if (attrs.name) {
    return attrs.name;
  }
  const heading = body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('# '));
  if (heading) {
    return heading.slice(2).trim();
  }
  return fallback;
}

function inferDescription(attrs: Record<string, string>, body: string): string {
  if (attrs.description) {
    return attrs.description;
  }
  const lines = body.split('\n').map((line) => line.trim());
  const paragraphLines: string[] = [];
  let inParagraph = false;
  for (const line of lines) {
    if (!line) {
      if (inParagraph) {
        break;
      }
      continue;
    }
    if (!inParagraph && line.startsWith('#')) {
      continue;
    }
    inParagraph = true;
    paragraphLines.push(line);
  }
  return paragraphLines.join(' ').slice(0, 280);
}

async function findSkillFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.toUpperCase() === 'SKILL.MD') {
        files.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return files;
}

/**
 * Loads SKILL.md metadata and creates lazy manifests.
 *
 * Standard metadata sources:
 * - frontmatter `title`/`name`
 * - frontmatter `description`
 * - no command mapping metadata is required; all skills are routable candidates
 * - markdown first `# Heading` and first paragraph (fallback title/description)
 */
export async function loadMarkdownSkillManifests(
  skillsDir: string,
  logger?: Logger
): Promise<SkillManifest[]> {
  try {
    const stat = await fs.stat(skillsDir);
    if (!stat.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const files = await findSkillFiles(skillsDir);
  const manifests: SkillManifest[] = [];

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = parseFrontmatter(raw);
    const relativePath = path.relative(skillsDir, filePath).replace(/\\/g, '/');
    const id = sanitizeId(parsed.attrs.id || relativePath || filePath);
    const title = inferTitle(parsed.attrs, parsed.body, id);
    const description = inferDescription(parsed.attrs, parsed.body) || 'No description provided.';
    const definition: MarkdownSkillDefinition = {
      id,
      title,
      description,
      sourcePath: filePath,
    };

    manifests.push({
      id,
      title,
      description,
      sourcePath: filePath,
      loader: async () => new MarkdownSkill(definition),
    });
  }

  if (manifests.length > 0) {
    logger?.info(`[skills] loaded metadata for ${manifests.length} SKILL.md file(s) from ${skillsDir}`);
  }

  return manifests;
}
