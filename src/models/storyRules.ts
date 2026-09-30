import type { ProjectLibrary, ProjectMeta } from './projectLibrary';
import type { StoryDocument, StoryScene, StoryStats } from './story';

export function orderedScenes(story: StoryDocument): StoryScene[] {
  return [...story.scenes].sort((a, b) => a.order - b.order);
}

export function getStats(story: StoryDocument): StoryStats {
  const unresolvedClues = story.clues.filter((clue) => clue.payoffSceneId === '').length;
  const totalSignals = story.characters.length + story.scenes.length + story.clues.length;
  const completedSignals = story.characters.length + story.scenes.length + (story.clues.length - unresolvedClues);
  const completion = totalSignals === 0 ? 0 : Math.round((completedSignals / totalSignals) * 100);
  return {
    characters: story.characters.length,
    scenes: story.scenes.length,
    clues: story.clues.length,
    unresolvedClues,
    completion,
  };
}

export function validateName(value: string): string {
  const cleanValue = value.trim();
  return cleanValue.length < 2 ? '至少输入 2 个字' : cleanValue;
}

export function getTimelineWarning(story: StoryDocument): string | null {
  const orders = story.scenes.map((scene) => scene.order);
  return new Set(orders).size !== orders.length ? '时间线存在重复顺序，请重新排列。' : null;
}

export function sanitizeStory(input: unknown): StoryDocument | null {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as Partial<StoryDocument>;
  if (
    candidate.version !== 1 ||
    typeof candidate.id !== 'string' ||
    typeof candidate.title !== 'string' ||
    !Array.isArray(candidate.characters) ||
    !Array.isArray(candidate.scenes) ||
    !Array.isArray(candidate.clues)
  ) {
    return null;
  }
  return candidate as StoryDocument;
}

export function buildProjectMeta(story: StoryDocument, archived = false, createdAt = story.updatedAt): ProjectMeta {
  return {
    id: story.id,
    title: story.title,
    status: story.status,
    archived,
    createdAt,
    updatedAt: story.updatedAt,
    stats: getStats(story),
  };
}

export function sanitizeProjectMeta(input: unknown): ProjectMeta | null {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as Partial<ProjectMeta>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.title !== 'string' ||
    (candidate.status !== 'draft' && candidate.status !== 'complete') ||
    typeof candidate.archived !== 'boolean' ||
    typeof candidate.createdAt !== 'string' ||
    typeof candidate.updatedAt !== 'string' ||
    !candidate.stats ||
    typeof candidate.stats !== 'object'
  ) {
    return null;
  }
  return candidate as ProjectMeta;
}

export function sanitizeLibrary(input: unknown): ProjectLibrary | null {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as Partial<ProjectLibrary>;
  if (candidate.version !== 2 || !Array.isArray(candidate.projects) || typeof candidate.activeProjectId !== 'string') {
    return null;
  }
  const projects = candidate.projects
    .map((item) => sanitizeProjectMeta(item))
    .filter((item): item is ProjectMeta => item !== null);
  if (projects.length === 0 || !projects.some((project) => project.id === candidate.activeProjectId)) return null;
  return { version: 2, activeProjectId: candidate.activeProjectId, projects };
}

export function createLibraryFromStories(stories: StoryDocument[], activeProjectId?: string): ProjectLibrary {
  const projects = stories.map((story) => buildProjectMeta(story));
  const activeId = activeProjectId && projects.some((project) => project.id === activeProjectId)
    ? activeProjectId
    : projects[0]?.id ?? '';
  return { version: 2, activeProjectId: activeId, projects };
}
