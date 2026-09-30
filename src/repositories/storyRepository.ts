import {
  bootstrapLibraryFromLegacy,
  sanitizeLibrary,
  type ProjectLibraryData,
} from '../models/projectLibrary';
import { createBlankStory, type StoryDocument } from '../models/story';
import { sanitizeStory } from '../models/storyRules';
import type { ProjectStorage } from '../services/storageService';

export interface StoryRepository {
  /** 读取项目库索引；首次启动时把旧文档迁移为第一个项目（旧键原样保留）。 */
  loadLibrary(): ProjectLibraryData;
  loadProject(projectId: string): StoryDocument;
  saveProject(story: StoryDocument): void;
  saveLibrary(library: ProjectLibraryData): void;
}

export class LocalStoryRepository implements StoryRepository {
  constructor(private readonly storage: ProjectStorage) {}

  loadLibrary(): ProjectLibraryData {
    const rawIndex = this.storage.readIndex();
    if (rawIndex) {
      try {
        const library = sanitizeLibrary(JSON.parse(rawIndex));
        if (library) return library;
      } catch {
        // 索引损坏则落到迁移流程，尽量从旧存储恢复。
      }
    }
    return this.migrateLegacy().library;
  }

  loadProject(projectId: string): StoryDocument {
    const raw = this.storage.readProject(projectId);
    if (raw) {
      try {
        const story = sanitizeStory(JSON.parse(raw));
        if (story) return story;
      } catch {
        // 落到保底空项目，避免整个工作台打不开。
      }
    }
    return { ...createBlankStory('未命名项目'), id: projectId };
  }

  saveProject(story: StoryDocument): void {
    this.storage.writeProject(story.id, JSON.stringify(story));
  }

  saveLibrary(library: ProjectLibraryData): void {
    this.storage.writeIndex(JSON.stringify(library));
  }

  private migrateLegacy() {
    const rawLegacy = this.storage.readLegacyDocument();
    let parsedLegacy: unknown = null;
    if (rawLegacy) {
      try {
        parsedLegacy = JSON.parse(rawLegacy);
      } catch {
        parsedLegacy = null;
      }
    }
    // 旧内容完整复制到独立的项目文档键；旧版单一文档键保持不动。
    const bootstrap = bootstrapLibraryFromLegacy(parsedLegacy, sanitizeStory);
    this.storage.writeProject(bootstrap.story.id, JSON.stringify(bootstrap.story));
    this.storage.writeIndex(JSON.stringify(bootstrap.library));
    return bootstrap;
  }
}
