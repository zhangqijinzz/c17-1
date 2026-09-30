import type { StoryStats } from './story';

export interface ProjectMeta {
  id: string;
  title: string;
  status: 'draft' | 'complete';
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  stats: StoryStats;
}

export interface ProjectLibrary {
  version: 2;
  activeProjectId: string;
  projects: ProjectMeta[];
}
