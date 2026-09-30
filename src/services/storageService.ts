export const LEGACY_DOCUMENT_KEY = 'story-architect.document.v1';
export const LIBRARY_STORAGE_KEY = 'story-architect.library.v2';
export const ACTIVE_POINTER_KEY = 'story-architect.active-project.v2';
const PROJECT_KEY_PREFIX = 'story-architect.project.v2.';

export function projectStorageKey(projectId: string): string {
  return `${PROJECT_KEY_PREFIX}${projectId}`;
}

export function isProjectStorageKey(key: string): boolean {
  return key.startsWith(PROJECT_KEY_PREFIX);
}

export function projectIdFromStorageKey(key: string): string {
  return key.slice(PROJECT_KEY_PREFIX.length);
}

export interface StorageService {
  read(key: string): string | null;
  write(key: string, value: string): void;
  keys(): string[];
}

export class BrowserStorageService implements StorageService {
  read(key: string): string | null {
    return window.localStorage.getItem(key);
  }

  write(key: string, value: string): void {
    window.localStorage.setItem(key, value);
  }

  keys(): string[] {
    return Object.keys(window.localStorage);
  }
}

export class MemoryStorageService implements StorageService {
  private readonly values = new Map<string, string>();

  read(key: string): string | null {
    return this.values.has(key) ? this.values.get(key)! : null;
  }

  write(key: string, value: string): void {
    this.values.set(key, value);
  }

  keys(): string[] {
    return [...this.values.keys()];
  }
}
