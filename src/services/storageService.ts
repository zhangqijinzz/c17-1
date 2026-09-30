export const LEGACY_DOCUMENT_KEY = 'story-architect.document.v1';
const LIBRARY_INDEX_KEY = 'story-architect.library.v1';
const PROJECT_KEY_PREFIX = 'story-architect.project.v1.';

export interface StorageService {
  read(): string | null;
  write(value: string): void;
}

/**
 * 只读写固定的旧版文档键，保留它以便回退到旧版本仍能打开旧内容。
 */
export class BrowserStorageService implements StorageService {
  read(): string | null {
    return window.localStorage.getItem(LEGACY_DOCUMENT_KEY);
  }

  write(value: string): void {
    window.localStorage.setItem(LEGACY_DOCUMENT_KEY, value);
  }
}

export class MemoryStorageService implements StorageService {
  private value: string | null = null;

  read(): string | null {
    return this.value;
  }

  write(value: string): void {
    this.value = value;
  }
}

export interface ProjectStorage {
  readIndex(): string | null;
  writeIndex(value: string): void;
  readProject(projectId: string): string | null;
  writeProject(projectId: string, value: string): void;
  /** 读取旧版单一文档键；迁移只读不写，原存储始终保留。 */
  readLegacyDocument(): string | null;
}

export class BrowserProjectStorage implements ProjectStorage {
  readIndex(): string | null {
    return window.localStorage.getItem(LIBRARY_INDEX_KEY);
  }

  writeIndex(value: string): void {
    window.localStorage.setItem(LIBRARY_INDEX_KEY, value);
  }

  readProject(projectId: string): string | null {
    return window.localStorage.getItem(PROJECT_KEY_PREFIX + projectId);
  }

  writeProject(projectId: string, value: string): void {
    window.localStorage.setItem(PROJECT_KEY_PREFIX + projectId, value);
  }

  readLegacyDocument(): string | null {
    return window.localStorage.getItem(LEGACY_DOCUMENT_KEY);
  }
}

export class MemoryProjectStorage implements ProjectStorage {
  private index: string | null = null;
  private readonly projects = new Map<string, string>();
  private legacy: string | null = null;

  readIndex(): string | null {
    return this.index;
  }

  writeIndex(value: string): void {
    this.index = value;
  }

  readProject(projectId: string): string | null {
    return this.projects.get(projectId) ?? null;
  }

  writeProject(projectId: string, value: string): void {
    this.projects.set(projectId, value);
  }

  readLegacyDocument(): string | null {
    return this.legacy;
  }

  /** 测试辅助：写入旧版存储，模拟首次启动前的状态。 */
  seedLegacy(value: string | null): void {
    this.legacy = value;
  }
}
