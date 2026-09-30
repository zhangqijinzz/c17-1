import { describe, expect, it } from 'vitest';
import { createStarterStory } from '../models/story';
import { LocalStoryRepository } from '../repositories/storyRepository';
import { LEGACY_DOCUMENT_KEY, MemoryProjectStorage } from '../services/storageService';
import { StoryViewModel } from '../viewmodels/storyViewModel';

function boot(storage: MemoryProjectStorage) {
  const repository = new LocalStoryRepository(storage);
  const viewModel = new StoryViewModel(repository);
  viewModel.initialize();
  return { repository, viewModel };
}

describe('story view model', () => {
  it('initializes, edits, persists, and restores the main flow', () => {
    const { repository, viewModel } = boot(new MemoryProjectStorage());
    expect(viewModel.snapshot.status).toBe('ready');
    viewModel.addCharacter('阿洛', '修复师');
    viewModel.addScene('地下档案室', '他们找到被隐藏的航海日志。');
    const scene = viewModel.selectedScene;
    expect(scene?.title).toBe('地下档案室');
    viewModel.toggleCharacter(scene?.id ?? '', viewModel.snapshot.story?.characters[2]?.id ?? '');
    expect(viewModel.snapshot.stats.characters).toBe(3);

    const restored = new StoryViewModel(repository);
    restored.initialize();
    expect(restored.snapshot.story?.scenes.some((item) => item.title === '地下档案室')).toBe(true);
    expect(restored.snapshot.story?.characters.some((item) => item.name === '阿洛')).toBe(true);
  });

  it('keeps unsaved edits of the previous project when switching', () => {
    const storage = new MemoryProjectStorage();
    const { repository, viewModel } = boot(storage);
    const firstId = viewModel.snapshot.activeProjectId!;
    viewModel.addCharacter('临时角色', '还没决定');
    viewModel.createProject('第二本书');
    expect(viewModel.snapshot.story?.characters).toHaveLength(0);
    expect(viewModel.snapshot.activeProjectId).not.toBe(firstId);

    // 切走前未落盘的改动应已被保存：直接从存储读取第一个项目验证。
    expect(repository.loadProject(firstId).characters.some((item) => item.name === '临时角色')).toBe(true);

    // 仍停留在第二本，重开工作台回到最近在写的项目。
    const reopened = boot(storage).viewModel;
    expect(reopened.snapshot.activeProjectId).not.toBe(firstId);
    reopened.switchProject(firstId);
    expect(reopened.snapshot.story?.characters.some((item) => item.name === '临时角色')).toBe(true);
  });

  it('supports create, rename and archive with separate structures', () => {
    const { viewModel } = boot(new MemoryProjectStorage());
    viewModel.createProject('雨夜档案馆');
    viewModel.addScene('第一幕', '雨下了一整夜。');
    expect(viewModel.snapshot.projects).toHaveLength(2);

    viewModel.renameProject(viewModel.snapshot.activeProjectId!, '雨夜档案馆 · 修订');
    expect(viewModel.snapshot.projects.find((p) => p.id === viewModel.snapshot.activeProjectId)?.title).toBe('雨夜档案馆 · 修订');

    const initialId = viewModel.snapshot.projects.find((p) => p.title === createStarterStory().title)!.id;
    viewModel.archiveProject(initialId);
    const initial = viewModel.snapshot.projects.find((p) => p.id === initialId)!;
    expect(initial.archived).toBe(true);
    expect(viewModel.snapshot.projects.filter((p) => !p.archived)).toHaveLength(1);

    viewModel.restoreProject(initialId);
    expect(viewModel.snapshot.projects.find((p) => p.id === initialId)?.archived).toBe(false);
  });

  it('shows per-project completion and unresolved clue counts', () => {
    const { viewModel } = boot(new MemoryProjectStorage());
    const starter = viewModel.snapshot.projects[0];
    expect(starter.stats.completion).toBe(80);
    expect(starter.stats.unresolvedClues).toBe(1);

    viewModel.createProject('空白本');
    const blank = viewModel.snapshot.projects.find((p) => p.id === viewModel.snapshot.activeProjectId)!;
    expect(blank.stats.completion).toBe(0);
    expect(blank.stats.unresolvedClues).toBe(0);
  });

  it('returns validation feedback for short names', () => {
    const { viewModel } = boot(new MemoryProjectStorage());
    viewModel.addCharacter(' ', '');
    expect(viewModel.snapshot.notice).toContain('至少');
  });
});

describe('legacy migration', () => {
  it('migrates the old single document into the first project intact', () => {
    const storage = new MemoryProjectStorage();
    const oldStory = createStarterStory();
    oldStory.title = '自定义旧故事';
    storage.seedLegacy(JSON.stringify(oldStory));

    const { viewModel, repository } = boot(storage);

    expect(viewModel.snapshot.story?.title).toBe('自定义旧故事');
    const first = viewModel.snapshot.projects[0];
    expect(first.id).toBe(oldStory.id);
    expect(first.stats.scenes).toBe(oldStory.scenes.length);
    expect(first.stats.clues).toBe(oldStory.clues.length);
    // 旧存储键必须原样保留，回退旧版本仍可打开。
    expect(storage.readLegacyDocument()).toBe(JSON.stringify(oldStory));
    expect(repository.loadProject(oldStory.id).scenes).toHaveLength(oldStory.scenes.length);
  });

  it('reopens the last active project and does not re-migrate', () => {
    const storage = new MemoryProjectStorage();
    storage.seedLegacy(JSON.stringify(createStarterStory()));
    const first = boot(storage).viewModel;
    first.createProject('最近在写的本');
    first.addScene('新开的一幕', '');

    const reopened = boot(storage).viewModel;
    expect(reopened.snapshot.story?.title).toBe('最近在写的本');
    expect(reopened.snapshot.story?.scenes.some((s) => s.title === '新开的一幕')).toBe(true);
    expect(reopened.snapshot.projects).toHaveLength(2);
  });

  it('falls back to the starter when the legacy document is corrupt', () => {
    const storage = new MemoryProjectStorage();
    storage.seedLegacy('{broken');
    const { viewModel } = boot(storage);
    expect(viewModel.snapshot.story?.id).toBe(createStarterStory().id);
  });
});

describe('storage keys', () => {
  it('keeps the legacy key constant', () => {
    expect(LEGACY_DOCUMENT_KEY).toBe('story-architect.document.v1');
  });
});
