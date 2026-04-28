import { AgentSkill, SkillManifest, SkillMetadata } from './types';

/**
 * Lazy skill registry keyed by identifier.
 */
export class SkillRegistry {
  private readonly manifestsById: Map<string, SkillManifest>;
  private readonly loadedSkills: Map<string, AgentSkill>;

  constructor(manifests: SkillManifest[]) {
    this.manifestsById = new Map();
    this.loadedSkills = new Map();
    for (const manifest of manifests) {
      if (!this.manifestsById.has(manifest.id)) {
        this.manifestsById.set(manifest.id, manifest);
      }
    }
  }

  listCandidates(): SkillMetadata[] {
    return Array.from(this.manifestsById.values()).map((manifest) => ({
      id: manifest.id,
      title: manifest.title,
      description: manifest.description,
      sourcePath: manifest.sourcePath,
      isolation: manifest.isolation,
      tools: manifest.tools,
      disallowedTools: manifest.disallowedTools,
      skills: manifest.skills,
      model: manifest.model,
    }));
  }

  listAll(): SkillMetadata[] {
    return this.listCandidates();
  }

  get(id: string): SkillMetadata | null {
    const manifest = this.manifestsById.get(id);
    if (!manifest) {
      return null;
    }
    return {
      id: manifest.id,
      title: manifest.title,
      description: manifest.description,
      sourcePath: manifest.sourcePath,
      isolation: manifest.isolation,
      tools: manifest.tools,
      disallowedTools: manifest.disallowedTools,
      skills: manifest.skills,
      model: manifest.model,
    };
  }

  resolveDependencyChain(skillId: string, visited = new Set<string>()): SkillMetadata[] {
    const manifest = this.manifestsById.get(skillId);
    if (!manifest || visited.has(skillId)) {
      return [];
    }
    visited.add(skillId);
    const dependencies = manifest.skills || [];
    const chain: SkillMetadata[] = [];
    for (const dependencyId of dependencies) {
      chain.push(...this.resolveDependencyChain(dependencyId, visited));
      const dependency = this.get(dependencyId);
      if (dependency) {
        chain.push(dependency);
      }
    }
    chain.push(this.get(skillId) || manifest);
    return chain.filter((item, index, items) => items.findIndex((entry) => entry.id === item.id) === index);
  }

  async load(skillId: string): Promise<AgentSkill | null> {
    const manifest = this.manifestsById.get(skillId);
    if (!manifest) {
      return null;
    }
    const cached = this.loadedSkills.get(manifest.id);
    if (cached) {
      return cached;
    }
    const skill = await manifest.loader();
    this.loadedSkills.set(manifest.id, skill);
    return skill;
  }
}
