import { getStats } from './storyRules';
import { createBlankStory, createStarterStory, type StoryDocument, type StoryStats } from './story';

export type ProjectArchiveState = 'active' | 'archived';

export interface ProjectSummary {
  id: string;
  title: string;
  status: StoryDocument['status'];
  archived: boolean;
  updatedAt: string;
  stats: StoryStats;
}

/** 持久化的项目库索引：只存元数据，完整结构各自存在独立文档键中。 */
export interface ProjectLibraryData {
  version: 1;
  activeId: string;
  projects: ProjectMeta[];
}

export interface ProjectMeta {
  id: string;
  title: string;
  status: StoryDocument['status'];
  archived: boolean;
  updatedAt: string;
}

export function createProjectMeta(story: StoryDocument, archived = false): ProjectMeta {
  return {
    id: story.id,
    title: story.title,
    status: story.status,
    archived,
    updatedAt: story.updatedAt,
  };
}

export function summarizeProject(meta: ProjectMeta, stats: StoryStats): ProjectSummary {
  return {
    id: meta.id,
    title: meta.title,
    status: meta.status,
    archived: meta.archived,
    updatedAt: meta.updatedAt,
    stats,
  };
}

export function createBlankProject(title: string): { meta: ProjectMeta; story: StoryDocument } {
  const story = createBlankStory(title);
  return { meta: createProjectMeta(story), story };
}

/** 首次启动迁移的结果：项目库索引与其首个项目的完整文档。 */
export interface LegacyBootstrap {
  library: ProjectLibraryData;
  story: StoryDocument;
}

/**
 * 首次启动迁移：把旧版单一文档平滑变成项目库里的第一个项目。
 * 旧存储由仓储层原样保留，这里只负责读出并生成索引/文档，不删除任何旧数据。
 */
export function bootstrapLibraryFromLegacy(
  parsedLegacy: unknown,
  sanitize: (input: unknown) => StoryDocument | null,
  fallback: () => StoryDocument = createStarterStory,
): LegacyBootstrap {
  const story = sanitize(parsedLegacy) ?? fallback();
  return {
    story,
    library: {
      version: 1,
      activeId: story.id,
      projects: [createProjectMeta(story)],
    },
  };
}

export function sanitizeLibrary(input: unknown): ProjectLibraryData | null {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as Partial<ProjectLibraryData>;
  if (
    candidate.version !== 1 ||
    typeof candidate.activeId !== 'string' ||
    !Array.isArray(candidate.projects) ||
    candidate.projects.some((project) => !isProjectMeta(project))
  ) {
    return null;
  }
  if (!candidate.projects.some((project) => project.id === candidate.activeId)) return null;
  return candidate as ProjectLibraryData;
}

function isProjectMeta(input: unknown): input is ProjectMeta {
  if (!input || typeof input !== 'object') return false;
  const candidate = input as Partial<ProjectMeta>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    (candidate.status === 'draft' || candidate.status === 'complete') &&
    typeof candidate.archived === 'boolean' &&
    typeof candidate.updatedAt === 'string'
  );
}

export function statsOf(story: StoryDocument): StoryStats {
  return getStats(story);
}
