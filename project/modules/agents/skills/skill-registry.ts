import { AgentSkill, SkillManifest, SkillMetadata } from './types';

/**
 * Lazy skill registry keyed by command type.
 */
export class SkillRegistry {
  private readonly manifestsById: Map<string, SkillManifest>;
  private readonly loadedSkills: Map<string, AgentSkill>;

  /**
   * @param manifests Skill manifests to register.
   */
  constructor(manifests: SkillManifest[]) {
    this.manifestsById = new Map<string, SkillManifest>();
    this.loadedSkills = new Map<string, AgentSkill>();

    for (const manifest of manifests) {
      if (!this.manifestsById.has(manifest.id)) {
        this.manifestsById.set(manifest.id, manifest);
      }
    }
  }

  /**
   * Lists lightweight metadata for all known skills.
   */
  listCandidates(): SkillMetadata[] {
    return Array.from(this.manifestsById.values()).map((manifest) => ({
      id: manifest.id,
      title: manifest.title,
      description: manifest.description,
      sourcePath: manifest.sourcePath,
    }));
  }

  /**
   * Lists metadata for all known skills.
   */
  listAll(): SkillMetadata[] {
    return this.listCandidates();
  }

  /**
   * Lazily loads a skill by id.
   *
   * @param skillId Skill identifier.
   * @returns Loaded skill, or null when id is unknown.
   */
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
