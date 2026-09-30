import type { ProjectLibrary } from '../models/projectLibrary';
import { createStarterStory, type StoryDocument } from '../models/story';
import {
  createLibraryFromStories,
  sanitizeLibrary,
  sanitizeStory,
} from '../models/storyRules';
import {
  ACTIVE_POINTER_KEY,
  isProjectStorageKey,
  LEGACY_DOCUMENT_KEY,
  LIBRARY_STORAGE_KEY,
  projectIdFromStorageKey,
  projectStorageKey,
  type StorageService,
} from '../services/storageService';

export interface ProjectRepository {
  loadLibrary(): ProjectLibrary;
  saveLibrary(library: ProjectLibrary): void;
  loadProject(projectId: string): StoryDocument | null;
  saveProject(story: StoryDocument): void;
}

export class LocalProjectRepository implements ProjectRepository {
  constructor(private readonly storage: StorageService) {}

  /**
   * 读取项目库。首次启动时把旧版单故事存储平滑迁入：
   * 旧内容原样成为库中第一个项目，旧 key 原样保留（旧版本仍可打开），
   * 迁移幂等。库索引损坏时扫描所有项目文档自救。
   */
  loadLibrary(): ProjectLibrary {
    const rawLibrary = this.storage.read(LIBRARY_STORAGE_KEY);
    if (rawLibrary) {
      try {
        const library = sanitizeLibrary(JSON.parse(rawLibrary));
        if (library) return library;
      } catch {
        // 索引损坏，落到下方的自愈流程
      }
    }

    const recovered = this.recoverLibrary();
    if (recovered) {
      this.saveLibrary(recovered);
      return recovered;
    }
    return this.bootstrapStarter();
  }

  saveLibrary(library: ProjectLibrary): void {
    this.storage.write(LIBRARY_STORAGE_KEY, JSON.stringify(library));
    // 额外记录活跃指针：即使库索引整体丢失，也能回到上次在写的项目
    this.storage.write(ACTIVE_POINTER_KEY, library.activeProjectId);
  }

  loadProject(projectId: string): StoryDocument | null {
    const raw = this.storage.read(projectStorageKey(projectId));
    if (!raw) return null;
    try {
      return sanitizeStory(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  saveProject(story: StoryDocument): void {
    this.storage.write(projectStorageKey(story.id), JSON.stringify(story));
  }

  /**
   * 自愈路径：先把旧版单故事文档迁入（内容字段一个不改、旧 key 保持不动），
   * 再与已有的项目文档合并重建索引。迁移幂等，不会覆盖已存在的项目文档。
   */
  private recoverLibrary(): ProjectLibrary | null {
    this.importLegacyStory();
    return this.rebuildFromProjectDocs();
  }

  private importLegacyStory(): void {
    const legacyRaw = this.storage.read(LEGACY_DOCUMENT_KEY);
    if (!legacyRaw) return;
    try {
      const story = sanitizeStory(JSON.parse(legacyRaw));
      if (story && !this.storage.read(projectStorageKey(story.id))) {
        this.storage.write(projectStorageKey(story.id), legacyRaw);
      }
    } catch {
      // 旧内容无法解析时忽略，绝不覆盖旧 key
    }
  }

  private rebuildFromProjectDocs(): ProjectLibrary | null {
    const stories = this.storage
      .keys()
      .filter(isProjectStorageKey)
      .map((key) => ({ key, story: this.loadProject(projectIdFromStorageKey(key)) }))
      .filter((entry): entry is { key: string; story: StoryDocument } => entry.story !== null)
      .map((entry) => entry.story);
    if (stories.length === 0) return null;
    const ordered = [...stories].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const pointer = this.storage.read(ACTIVE_POINTER_KEY) ?? undefined;
    return createLibraryFromStories(ordered, pointer);
  }

  private bootstrapStarter(): ProjectLibrary {
    const story = createStarterStory();
    this.saveProject(story);
    const library = createLibraryFromStories([story], story.id);
    this.saveLibrary(library);
    return library;
  }
}
