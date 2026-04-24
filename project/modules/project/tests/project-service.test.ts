import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectService } from '../project-service';
import { ProjectRepository } from '../types/project-repo';
import { Project, CreateProjectInput, UpdateProjectInput } from '../types/project';

describe('ProjectService', () => {
  let service: ProjectService;
  let mockRepo: ProjectRepository;

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      getById: vi.fn(),
      listByUserId: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      connect: vi.fn(),
      close: vi.fn(),
    };
    service = new ProjectService(mockRepo);
  });

  describe('createProject', () => {
    it('should create a project with valid input', async () => {
      const input: CreateProjectInput = {
        userId: 'user_1',
        name: 'My Project',
        repoUrl: 'https://github.com/user/repo',
        description: 'Test project',
      };

      const expectedProject: Project = {
        id: 'proj_1',
        userId: 'user_1',
        name: 'My Project',
        repoUrl: 'https://github.com/user/repo',
        description: 'Test project',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.mocked(mockRepo.create).mockResolvedValue(expectedProject);

      const result = await service.createProject(input);

      expect(mockRepo.create).toHaveBeenCalledWith(input);
      expect(result).toEqual(expectedProject);
    });

    it('should throw error when name is empty', async () => {
      const input: CreateProjectInput = {
        userId: 'user_1',
        name: '',
        repoUrl: 'https://github.com/user/repo',
      };

      await expect(service.createProject(input)).rejects.toThrow('Project name is required');
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('should throw error when name is only whitespace', async () => {
      const input: CreateProjectInput = {
        userId: 'user_1',
        name: '   ',
        repoUrl: 'https://github.com/user/repo',
      };

      await expect(service.createProject(input)).rejects.toThrow('Project name is required');
    });

    it('should throw error when repoUrl is empty', async () => {
      const input: CreateProjectInput = {
        userId: 'user_1',
        name: 'My Project',
        repoUrl: '',
      };

      await expect(service.createProject(input)).rejects.toThrow('Repository URL is required');
    });

    it('should throw error when repoUrl is only whitespace', async () => {
      const input: CreateProjectInput = {
        userId: 'user_1',
        name: 'My Project',
        repoUrl: '   ',
      };

      await expect(service.createProject(input)).rejects.toThrow('Repository URL is required');
    });

    it('should create project with optional fields', async () => {
      const input: CreateProjectInput = {
        userId: 'user_1',
        name: 'My Project',
        repoUrl: 'https://github.com/user/repo',
        design: 'Design docs',
        rules: 'Coding rules',
      };

      const expectedProject: Project = {
        id: 'proj_1',
        ...input,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.mocked(mockRepo.create).mockResolvedValue(expectedProject);

      const result = await service.createProject(input);

      expect(result).toEqual(expectedProject);
    });
  });

  describe('getProjectById', () => {
    it('should return project when found', async () => {
      const project: Project = {
        id: 'proj_1',
        userId: 'user_1',
        name: 'My Project',
        repoUrl: 'https://github.com/user/repo',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      vi.mocked(mockRepo.getById).mockResolvedValue(project);

      const result = await service.getProjectById('proj_1');

      expect(mockRepo.getById).toHaveBeenCalledWith('proj_1');
      expect(result).toEqual(project);
    });

    it('should return undefined when project not found', async () => {
      vi.mocked(mockRepo.getById).mockResolvedValue(undefined);

      const result = await service.getProjectById('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('listUserProjects', () => {
    it('should return all projects for a user', async () => {
      const projects: Project[] = [
        {
          id: 'proj_1',
          userId: 'user_1',
          name: 'Project 1',
          repoUrl: 'https://github.com/user/repo1',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'proj_2',
          userId: 'user_1',
          name: 'Project 2',
          repoUrl: 'https://github.com/user/repo2',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      vi.mocked(mockRepo.listByUserId).mockResolvedValue(projects);

      const result = await service.listUserProjects('user_1');

      expect(mockRepo.listByUserId).toHaveBeenCalledWith('user_1');
      expect(result).toEqual(projects);
    });

    it('should return empty array when user has no projects', async () => {
      vi.mocked(mockRepo.listByUserId).mockResolvedValue([]);

      const result = await service.listUserProjects('user_1');

      expect(result).toEqual([]);
    });
  });

  describe('updateProject', () => {
    it('should update project with valid input', async () => {
      const input: UpdateProjectInput = {
        name: 'Updated Name',
        description: 'Updated description',
      };

      vi.mocked(mockRepo.exists).mockResolvedValue(true);
      vi.mocked(mockRepo.update).mockResolvedValue(undefined);

      await service.updateProject('proj_1', input);

      expect(mockRepo.exists).toHaveBeenCalledWith('proj_1');
      expect(mockRepo.update).toHaveBeenCalledWith('proj_1', input);
    });

    it('should throw error when project does not exist', async () => {
      vi.mocked(mockRepo.exists).mockResolvedValue(false);

      await expect(service.updateProject('nonexistent', { name: 'New Name' }))
        .rejects.toThrow('Project not found: nonexistent');

      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('should throw error when name is empty string', async () => {
      vi.mocked(mockRepo.exists).mockResolvedValue(true);

      await expect(service.updateProject('proj_1', { name: '' }))
        .rejects.toThrow('Project name cannot be empty');

      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('should throw error when name is only whitespace', async () => {
      vi.mocked(mockRepo.exists).mockResolvedValue(true);

      await expect(service.updateProject('proj_1', { name: '   ' }))
        .rejects.toThrow('Project name cannot be empty');
    });

    it('should throw error when repoUrl is empty string', async () => {
      vi.mocked(mockRepo.exists).mockResolvedValue(true);

      await expect(service.updateProject('proj_1', { repoUrl: '' }))
        .rejects.toThrow('Repository URL cannot be empty');
    });

    it('should allow updating optional fields', async () => {
      const input: UpdateProjectInput = {
        design: 'New design',
        rules: 'New rules',
      };

      vi.mocked(mockRepo.exists).mockResolvedValue(true);
      vi.mocked(mockRepo.update).mockResolvedValue(undefined);

      await service.updateProject('proj_1', input);

      expect(mockRepo.update).toHaveBeenCalledWith('proj_1', input);
    });
  });

  describe('deleteProject', () => {
    it('should delete project', async () => {
      vi.mocked(mockRepo.delete).mockResolvedValue(undefined);

      await service.deleteProject('proj_1');

      expect(mockRepo.delete).toHaveBeenCalledWith('proj_1');
    });
  });

  describe('projectExists', () => {
    it('should return true when project exists', async () => {
      vi.mocked(mockRepo.exists).mockResolvedValue(true);

      const result = await service.projectExists('proj_1');

      expect(mockRepo.exists).toHaveBeenCalledWith('proj_1');
      expect(result).toBe(true);
    });

    it('should return false when project does not exist', async () => {
      vi.mocked(mockRepo.exists).mockResolvedValue(false);

      const result = await service.projectExists('nonexistent');

      expect(result).toBe(false);
    });
  });
});
