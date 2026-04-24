/**
 * Project API client utilities
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

export interface CreateProjectInput {
  name: string;
  repoUrl: string;
  description?: string;
  design?: string;
  rules?: string;
}

export interface UpdateProjectInput {
  name?: string;
  repoUrl?: string;
  description?: string;
  design?: string;
  rules?: string;
}

/**
 * Fetches all projects for the current user
 */
export async function fetchProjects(): Promise<Project[]> {
  const response = await fetch('/api/projects', {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch projects: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetches a single project by ID
 */
export async function fetchProject(id: string): Promise<Project> {
  const response = await fetch(`/api/projects/${id}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch project: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Creates a new project
 */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || 'Failed to create project');
  }
  return response.json();
}

/**
 * Updates an existing project
 */
export async function updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
  const response = await fetch(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || 'Failed to update project');
  }
  return response.json();
}

/**
 * Deletes a project
 */
export async function deleteProject(id: string): Promise<void> {
  const response = await fetch(`/api/projects/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || 'Failed to delete project');
  }
}
