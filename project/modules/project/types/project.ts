/**
 * Project entity representing a software project with context.
 */
export interface Project {
  id: string;
  userId: string;
  name: string;
  repoUrl: string;
  description?: string;
  design?: string;
  rules?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Input for creating a new project.
 */
export interface CreateProjectInput {
  userId: string;
  name: string;
  repoUrl: string;
  description?: string;
  design?: string;
  rules?: string;
}

/**
 * Input for updating an existing project.
 */
export interface UpdateProjectInput {
  name?: string;
  repoUrl?: string;
  description?: string;
  design?: string;
  rules?: string;
}
