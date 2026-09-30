import { describe, expect, it } from 'vitest';
import { LEGACY_DOCUMENT_KEY, LIBRARY_STORAGE_KEY, MemoryStorageService, projectStorageKey } from '../services/storageService';
import { createStarterStory } from '../models/story';
import { LocalProjectRepository } from '../repositories/projectRepository';
import { StoryViewModel } from '../viewmodels/storyViewModel';

function setup() {
  const storage = new MemoryStorageService();
  const repository = new LocalProjectRepository(storage);
  const viewModel = new StoryViewModel(repository);
  return { storage, repository, viewModel };
}

describe('story view model', () => {
  it('initializes, edits, persists, and restores the main flow', () => {
    const { repository, viewModel } = setup();
    viewModel.initialize();
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

  it('shows recoverable validation feedback and resets corrupt storage', () => {
    const { viewModel } = setup();
    viewModel.initialize();
    viewModel.addCharacter(' ', '');
    expect(viewModel.snapshot.notice).toContain('至少');
    viewModel.resetProject();
    expect(viewModel.snapshot.story?.id).toBe(createStarterStory().id);
  });

  it('creates independent projects that keep their own structures', () => {
    const { viewModel } = setup();
    viewModel.initialize();
    const firstId = viewModel.snapshot.story!.id;
    expect(viewModel.projects).toHaveLength(1);

    expect(viewModel.createProject('  ')).toBe(false);
    expect(viewModel.createProject('迷雾档案')).toBe(true);
    const secondId = viewModel.snapshot.story!.id;
    expect(secondId).not.toBe(firstId);
    expect(viewModel.snapshot.story?.title).toBe('迷雾档案');
    expect(viewModel.snapshot.story?.scenes).toHaveLength(0);
    expect(viewModel.projects).toHaveLength(2);

    viewModel.addScene('第二本的第一幕', '只属于迷雾档案。');
    viewModel.switchProject(firstId);
    expect(viewModel.snapshot.story?.id).toBe(firstId);
    expect(viewModel.snapshot.story?.scenes.some((scene) => scene.title === '第二本的第一幕')).toBe(false);

    viewModel.switchProject(secondId);
    expect(viewModel.snapshot.story?.scenes.some((scene) => scene.title === '第二本的第一幕')).toBe(true);
  });

  it('flushes unsaved edits of the current project before switching', () => {
    const { repository, viewModel } = setup();
    viewModel.initialize();
    const firstId = viewModel.snapshot.story!.id;
    viewModel.createProject('另一本');
    const secondId = viewModel.snapshot.story!.id;
    viewModel.switchProject(firstId);
    viewModel.addCharacter('还没点保存的人', '旁观者');

    viewModel.switchProject(secondId);
    const firstDoc = repository.loadProject(firstId);
    expect(firstDoc?.characters.some((character) => character.name === '还没点保存的人')).toBe(true);
  });

  it('remembers the active project when the workbench is reopened', () => {
    const { repository, viewModel } = setup();
    viewModel.initialize();
    const firstId = viewModel.snapshot.story!.id;
    viewModel.createProject('重启后回到我');
    const secondId = viewModel.snapshot.story!.id;
    viewModel.addCharacter('小记号', '');

    const reopened = new StoryViewModel(repository);
    reopened.initialize();
    expect(reopened.snapshot.story?.id).toBe(secondId);
    expect(reopened.snapshot.story?.characters.some((character) => character.name === '小记号')).toBe(true);
    expect(reopened.snapshot.library?.activeProjectId).toBe(secondId);
    expect(firstId).not.toBe(secondId);
  });

  it('renames and archives projects, auto-switching away from the archived one', () => {
    const { repository, viewModel } = setup();
    viewModel.initialize();
    const firstId = viewModel.snapshot.story!.id;
    viewModel.createProject('要归档的本子');
    const secondId = viewModel.snapshot.story!.id;
    viewModel.addScene('存档幕', '');

    expect(viewModel.renameProject(secondId, '新的名字')).toBe(true);
    expect(viewModel.projects.find((project) => project.id === secondId)?.title).toBe('新的名字');
    expect(repository.loadProject(secondId)?.title).toBe('新的名字');

    viewModel.archiveProject(secondId);
    expect(viewModel.snapshot.story?.id).toBe(firstId);
    expect(viewModel.projects.find((project) => project.id === secondId)?.archived).toBe(true);
    expect(viewModel.projects.filter((project) => !project.archived)).toHaveLength(1);

    expect(viewModel.unarchiveProject(secondId)).toBe(true);
    expect(viewModel.projects.find((project) => project.id === secondId)?.archived).toBe(false);
  });

  it('creates a fresh active project when archiving the only active one', () => {
    const { viewModel } = setup();
    viewModel.initialize();
    const onlyId = viewModel.snapshot.story!.id;
    viewModel.archiveProject(onlyId);
    expect(viewModel.snapshot.story?.id).not.toBe(onlyId);
    expect(viewModel.projects.find((project) => project.id === onlyId)?.archived).toBe(true);
    expect(viewModel.projects.filter((project) => !project.archived)).toHaveLength(1);
  });

  it('keeps completion and unresolved-clue stats per project visible in the library', () => {
    const { viewModel } = setup();
    viewModel.initialize();
    const firstId = viewModel.snapshot.story!.id;
    const firstMeta = viewModel.projects.find((project) => project.id === firstId)!;
    expect(firstMeta.stats.unresolvedClues).toBe(1);
    expect(firstMeta.stats.completion).toBe(80);

    viewModel.createProject('干净本子');
    const secondId = viewModel.snapshot.story!.id;
    viewModel.addCharacter('新人', '角色');
    const secondMeta = viewModel.projects.find((project) => project.id === secondId)!;
    // 人物本身即完整结构信号：无伏笔时完成度 100%
    expect(secondMeta.stats.completion).toBe(100);
    expect(secondMeta.stats.unresolvedClues).toBe(0);
    expect(viewModel.projects.find((project) => project.id === firstId)?.stats.unresolvedClues).toBe(1);
  });
});

describe('legacy storage migration', () => {
  it('turns the old single document into the first project without losing content', () => {
    const storage = new MemoryStorageService();
    const legacy = createStarterStory();
    storage.write(LEGACY_DOCUMENT_KEY, JSON.stringify(legacy));

    const repository = new LocalProjectRepository(storage);
    const library = repository.loadLibrary();

    expect(library.projects).toHaveLength(1);
    expect(library.activeProjectId).toBe(legacy.id);
    const migrated = repository.loadProject(legacy.id);
    expect(migrated).toEqual(legacy);
    // 旧存储原样保留，退回旧版本仍可打开
    expect(storage.read(LEGACY_DOCUMENT_KEY)).toBe(JSON.stringify(legacy));
    expect(storage.read(LIBRARY_STORAGE_KEY)).not.toBeNull();
    expect(storage.read(projectStorageKey(legacy.id))).toBe(JSON.stringify(legacy));
  });

  it('migrates idempotently and does not copy over an already migrated project', () => {
    const storage = new MemoryStorageService();
    const legacy = createStarterStory();
    storage.write(LEGACY_DOCUMENT_KEY, JSON.stringify(legacy));
    const repository = new LocalProjectRepository(storage);

    repository.loadLibrary();
    const viewModel = new StoryViewModel(repository);
    viewModel.initialize();
    viewModel.addCharacter('迁移后新增', '');
    repository.loadLibrary(); // 第二次启动

    const library = JSON.parse(storage.read(LIBRARY_STORAGE_KEY)!);
    expect(library.projects).toHaveLength(1);
    const doc = JSON.parse(storage.read(projectStorageKey(legacy.id))!);
    expect(doc.characters.some((character: { name: string }) => character.name === '迁移后新增')).toBe(true);
    // 旧 key 从未被覆写
    expect(JSON.parse(storage.read(LEGACY_DOCUMENT_KEY)!).characters).toHaveLength(2);
  });

  it('rebuilds the library index from project documents when the index is lost', () => {
    const storage = new MemoryStorageService();
    const repository = new LocalProjectRepository(storage);
    const first = new StoryViewModel(repository);
    first.initialize();
    const firstId = first.snapshot.story!.id;
    first.createProject('索引损坏测试');
    const secondId = first.snapshot.story!.id;
    first.addScene('幸存的一幕', '');

    storage.write(LIBRARY_STORAGE_KEY, '{broken');
    const rebuiltRepository = new LocalProjectRepository(storage);
    const rebuilt = rebuiltRepository.loadLibrary();
    expect(rebuilt.projects.map((project) => project.id).sort()).toEqual([firstId, secondId].sort());
    expect(rebuilt.activeProjectId).toBe(secondId); // 最近更新的项目排前
    expect(rebuiltRepository.loadProject(secondId)?.scenes.some((scene) => scene.title === '幸存的一幕')).toBe(true);
  });
});
