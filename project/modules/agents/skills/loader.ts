import fs from 'node:fs/promises';
import path from 'node:path';
import { Logger } from '../../utils/logger';
import { MarkdownSkillDefinition, SkillManifest } from './types';
import { MarkdownSkill } from './markdown-skill';
import { parseSkillMarkdown } from './parser';

function sanitizeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-_/.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
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
      if (entry.isFile() && /^(skill|SKILL)\.md$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return files;
}

function inferTitle(parsedId: string, frontmatterTitle?: string, body?: string): string {
  if (frontmatterTitle?.trim()) {
    return frontmatterTitle.trim();
  }
  const heading = body
    ?.split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('# '));
  if (heading) {
    return heading.slice(2).trim();
  }
  return parsedId;
}

function inferDescription(frontmatterDescription?: string, body?: string): string {
  if (frontmatterDescription?.trim()) {
    return frontmatterDescription.trim();
  }
  const lines = body?.split('\n').map((line) => line.trim()) || [];
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
  return paragraphLines.join(' ').slice(0, 280) || 'No description provided.';
}

/**
 * Loads markdown skill manifests from a root directory.
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
    const parsed = parseSkillMarkdown(raw);
    const relativePath = path.relative(skillsDir, filePath).replace(/\\/g, '/');
    const id = sanitizeId(parsed.frontmatter.id || parsed.frontmatter.name || relativePath || filePath);
    const title = inferTitle(id, parsed.frontmatter.title || parsed.frontmatter.name, parsed.body);
    const description = inferDescription(parsed.frontmatter.description, parsed.body);

    const definition: MarkdownSkillDefinition = {
      id,
      title,
      description,
      sourcePath: filePath,
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      tools: parsed.frontmatter.tools,
      disallowedTools: parsed.frontmatter.disallowedTools,
      skills: parsed.frontmatter.skills,
      model: parsed.frontmatter.model,
      isolation: parsed.frontmatter.isolation,
    };

    manifests.push({
      id,
      title,
      description,
      sourcePath: filePath,
      tools: parsed.frontmatter.tools,
      disallowedTools: parsed.frontmatter.disallowedTools,
      skills: parsed.frontmatter.skills,
      model: parsed.frontmatter.model,
      isolation: parsed.frontmatter.isolation,
      loader: async () => new MarkdownSkill(definition),
    });
  }

  if (manifests.length > 0) {
    logger?.info(`[skills] loaded metadata for ${manifests.length} skill file(s) from ${skillsDir}`);
  }

  return manifests;
}
