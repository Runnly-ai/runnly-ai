import { Project, CreateProjectInput, UpdateProjectInput } from './types/project';
import { ProjectRepository } from './types/project-repo';

/**
 * Service for managing projects.
 */
export class ProjectService {
  constructor(private readonly projectRepo: ProjectRepository) {}

  /**
   * Creates a new project.
   */
  async createProject(input: CreateProjectInput): Promise<Project> {
    // Validation
    if (!input.name?.trim()) {
      throw new Error('Project name is required');
    }
    if (!input.repoUrl?.trim()) {
      throw new Error('Repository URL is required');
    }

    return this.projectRepo.create(input);
  }

  /**
   * Gets a project by ID.
   */
  async getProjectById(id: string): Promise<Project | undefined> {
    return this.projectRepo.getById(id);
  }

  /**
   * Lists all projects for a user.
   */
  async listUserProjects(userId: string): Promise<Project[]> {
    return this.projectRepo.listByUserId(userId);
  }

  /**
   * Updates a project.
   */
  async updateProject(id: string, input: UpdateProjectInput): Promise<void> {
    const exists = await this.projectRepo.exists(id);
    if (!exists) {
      throw new Error(`Project not found: ${id}`);
    }

    // Validation
    if (input.name !== undefined && !input.name.trim()) {
      throw new Error('Project name cannot be empty');
    }
    if (input.repoUrl !== undefined && !input.repoUrl.trim()) {
      throw new Error('Repository URL cannot be empty');
    }

    return this.projectRepo.update(id, input);
  }

  /**
   * Deletes a project.
   */
  async deleteProject(id: string): Promise<void> {
    return this.projectRepo.delete(id);
  }

  /**
   * Checks if a project exists.
   */
  async projectExists(id: string): Promise<boolean> {
    return this.projectRepo.exists(id);
  }
}
