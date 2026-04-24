import { Project, CreateProjectInput, UpdateProjectInput } from './project';

/**
 * Repository contract for project persistence.
 */
export interface ProjectRepository {
  /**
   * Connects to the database and applies schema.
   */
  connect(): Promise<void>;

  /**
   * Closes the database connection.
   */
  close(): Promise<void>;
  /**
   * Creates a new project.
   */
  create(input: CreateProjectInput): Promise<Project>;

  /**
   * Retrieves a project by ID.
   */
  getById(id: string): Promise<Project | undefined>;

  /**
   * Lists all projects for a user.
   */
  listByUserId(userId: string): Promise<Project[]>;

  /**
   * Updates an existing project.
   */
  update(id: string, input: UpdateProjectInput): Promise<void>;

  /**
   * Deletes a project by ID.
   */
  delete(id: string): Promise<void>;

  /**
   * Checks if a project exists by ID.
   */
  exists(id: string): Promise<boolean>;
}
