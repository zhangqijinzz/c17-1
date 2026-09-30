import {
  characterColors,
  createBlankStory,
  createId,
  createStarterStory,
  type StoryCharacter,
  type StoryClue,
  type StoryDocument,
  type StoryScene,
} from '../models/story';
import { getStats, getTimelineWarning, orderedScenes, validateName } from '../models/storyRules';
import type { ProjectLibrary, ProjectMeta } from '../models/projectLibrary';
import type { ProjectRepository } from '../repositories/projectRepository';

export type ViewModelStatus = 'loading' | 'ready' | 'editing' | 'error' | 'completed';

export interface StoryViewState {
  status: ViewModelStatus;
  story: StoryDocument | null;
  stats: ReturnType<typeof getStats>;
  notice: string;
  error: string;
  search: string;
  activeSection: 'overview' | 'characters' | 'clues';
  library: ProjectLibrary | null;
  projectSwitcherOpen: boolean;
}

type Listener = () => void;

const EMPTY_STATS = { characters: 0, scenes: 0, clues: 0, unresolvedClues: 0, completion: 0 };

export class StoryViewModel {
  private state: StoryViewState = {
    status: 'loading',
    story: null,
    stats: EMPTY_STATS,
    notice: '',
    error: '',
    search: '',
    activeSection: 'overview',
    library: null,
    projectSwitcherOpen: false,
  };
  private readonly listeners = new Set<Listener>();

  constructor(private readonly repository: ProjectRepository) {}

  get snapshot(): StoryViewState {
    return this.state;
  }

  get projects(): ProjectMeta[] {
    return this.state.library?.projects ?? [];
  }

  get activeProject(): ProjectMeta | null {
    const library = this.state.library;
    if (!library) return null;
    return library.projects.find((project) => project.id === library.activeProjectId) ?? null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  initialize(): void {
    try {
      const library = this.repository.loadLibrary();
      const { story, error } = this.openProjectDocument(library.activeProjectId);
      if (!story) {
        this.setState({ status: 'error', error: '所有项目都无法读取，请重置当前项目。' });
        return;
      }
      const syncedLibrary = this.syncLibraryWithStory(library, story);
      this.setState({
        status: story.status === 'complete' ? 'completed' : 'ready',
        story,
        stats: getStats(story),
        library: syncedLibrary,
        error,
      });
    } catch {
      this.setState({ status: 'error', error: '项目库读取失败，请检查本地存储。' });
    }
  }

  setProjectSwitcherOpen(open: boolean): void {
    this.setState({ projectSwitcherOpen: open });
  }

  setSearch(search: string): void {
    this.setState({ search });
  }

  setSection(activeSection: StoryViewState['activeSection']): void {
    this.setState({ activeSection });
  }

  selectScene(sceneId: string): void {
    this.updateStory((story) => ({ ...story, selectedSceneId: sceneId }));
  }

  addCharacter(name: string, role: string): void {
    const cleanName = validateName(name);
    if (cleanName === '至少输入 2 个字') {
      this.setState({ notice: cleanName });
      return;
    }
    const story = this.requireStory();
    const character: StoryCharacter = {
      id: createId('character'),
      name: cleanName,
      role: role.trim() || '待定义角色',
      color: characterColors[story.characters.length % characterColors.length],
    };
    this.updateStory((current) => ({ ...current, characters: [...current.characters, character] }));
    this.setState({ notice: `已加入人物「${character.name}」` });
  }

  addScene(title: string, summary: string): void {
    const cleanTitle = validateName(title);
    if (cleanTitle === '至少输入 2 个字') {
      this.setState({ notice: cleanTitle });
      return;
    }
    const story = this.requireStory();
    const scene: StoryScene = {
      id: createId('scene'),
      title: cleanTitle,
      order: story.scenes.length + 1,
      summary: summary.trim() || '还没有写下这一幕发生了什么。',
      conflict: '',
      characterIds: [],
      clueIds: [],
    };
    this.updateStory((current) => ({ ...current, scenes: [...current.scenes, scene], selectedSceneId: scene.id }));
    this.setState({ notice: `已创建场景「${scene.title}」` });
  }

  updateScene(sceneId: string, patch: Partial<Pick<StoryScene, 'title' | 'summary' | 'conflict'>>): void {
    this.updateStory((story) => ({
      ...story,
      scenes: story.scenes.map((scene) => (scene.id === sceneId ? { ...scene, ...patch } : scene)),
    }), false);
  }

  toggleCharacter(sceneId: string, characterId: string): void {
    this.updateStory((story) => ({
      ...story,
      scenes: story.scenes.map((scene) => {
        if (scene.id !== sceneId) return scene;
        const hasCharacter = scene.characterIds.includes(characterId);
        return { ...scene, characterIds: hasCharacter ? scene.characterIds.filter((id) => id !== characterId) : [...scene.characterIds, characterId] };
      }),
    }));
  }

  moveScene(sceneId: string, direction: 'up' | 'down'): void {
    const scenes = orderedScenes(this.requireStory());
    const index = scenes.findIndex((scene) => scene.id === sceneId);
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= scenes.length) return;
    [scenes[index], scenes[nextIndex]] = [scenes[nextIndex], scenes[index]];
    this.updateStory((story) => ({ ...story, scenes: scenes.map((scene, sceneIndex) => ({ ...scene, order: sceneIndex + 1 })) }));
    this.setState({ notice: '时间线顺序已更新' });
  }

  addClue(title: string, setupSceneId: string, payoffSceneId: string): void {
    const cleanTitle = validateName(title);
    if (cleanTitle === '至少输入 2 个字') {
      this.setState({ notice: cleanTitle });
      return;
    }
    if (!setupSceneId) {
      this.setState({ notice: '请先选择伏笔埋下的场景' });
      return;
    }
    const clue: StoryClue = { id: createId('clue'), title: cleanTitle, setupSceneId, payoffSceneId };
    this.updateStory((story) => ({
      ...story,
      clues: [...story.clues, clue],
      scenes: story.scenes.map((scene) => scene.id === setupSceneId ? { ...scene, clueIds: [...scene.clueIds, clue.id] } : scene),
    }));
    this.setState({ notice: payoffSceneId ? '伏笔关系已建立' : '伏笔已记录，等待回收' });
  }

  completeProject(): void {
    this.updateStory((story) => ({ ...story, status: 'complete' }));
    this.setState({ status: 'completed', notice: '项目已标记为完成，仍可继续编辑' });
  }

  resetProject(): void {
    const current = this.requireStory();
    const story: StoryDocument = {
      ...createStarterStory(),
      id: current.id,
      title: current.title,
      status: 'draft',
    };
    this.commitStory(story);
    this.setState({ status: 'ready', story, stats: getStats(story), notice: '当前项目内容已重置为示例', error: '' });
  }

  // ===== 项目库操作 =====

  createProject(title: string): boolean {
    const cleanTitle = validateName(title);
    if (cleanTitle === '至少输入 2 个字') {
      this.setState({ notice: '项目名至少输入 2 个字' });
      return false;
    }
    if (!this.flushCurrent()) return false;
    const story: StoryDocument = createBlankStory(cleanTitle);
    let library = this.requireLibrary();
    const meta = this.buildMeta(story);
    library = {
      ...library,
      activeProjectId: story.id,
      projects: [meta, ...library.projects],
    };
    if (!this.persistProjectAndLibrary(story, library)) return false;
    this.resetViewForProject(story, library);
    this.setState({ notice: `已创建并切换到「${cleanTitle}」` });
    return true;
  }

  switchProject(projectId: string): boolean {
    const library = this.state.library;
    if (!library || projectId === library.activeProjectId) {
      this.setState({ projectSwitcherOpen: false });
      return false;
    }
    const target = library.projects.find((project) => project.id === projectId);
    if (!target) return false;
    // 切换前必须先把当前项目未落盘的改动存住
    if (!this.flushCurrent()) return false;
    const { story, error } = this.openProjectDocument(projectId, library);
    if (!story) {
      this.setState({ error: error || `项目「${target.title}」读取失败` });
      return false;
    }
    const syncedLibrary = this.syncLibraryWithStory(library, story);
    this.resetViewForProject(story, syncedLibrary);
    this.setState({ notice: `已切换到「${story.title}」`, projectSwitcherOpen: false, error: '' });
    return true;
  }

  renameProject(projectId: string, title: string): boolean {
    const cleanTitle = validateName(title);
    if (cleanTitle === '至少输入 2 个字') {
      this.setState({ notice: '项目名至少输入 2 个字' });
      return false;
    }
    const library = this.requireLibrary();
    const exists = library.projects.some((project) => project.id === projectId);
    if (!exists) return false;
    const nextLibrary = {
      ...library,
      projects: library.projects.map((project) => project.id === projectId ? { ...project, title: cleanTitle, updatedAt: new Date().toISOString() } : project),
    };
    // 重命名的是当前项目时，文档标题也要一起改
    let nextStory = this.state.story;
    if (this.state.story?.id === projectId) {
      nextStory = { ...this.state.story, title: cleanTitle };
      if (!this.persistProjectAndLibrary(nextStory, nextLibrary)) return false;
    } else {
      try {
        this.repository.saveLibrary(nextLibrary);
      } catch {
        this.setState({ error: '保存失败，但当前编辑仍保留在页面中。' });
        return false;
      }
    }
    this.setState({ library: nextLibrary, ...(nextStory ? { story: nextStory } : {}), notice: `项目已重命名为「${cleanTitle}」` });
    return true;
  }

  archiveProject(projectId: string): boolean {
    const library = this.requireLibrary();
    const target = library.projects.find((project) => project.id === projectId);
    if (!target || target.archived) return false;
    if (!this.flushCurrent()) return false;
    const archivedLibrary = {
      ...library,
      projects: library.projects.map((project) => project.id === projectId ? { ...project, archived: true } : project),
    };
    // 归档当前项目后自动切到最近更新的未归档项目；没有则新建一个
    if (projectId === archivedLibrary.activeProjectId) {
      const fallback = archivedLibrary.projects
        .filter((project) => !project.archived)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (fallback) {
        const { story, error } = this.openProjectDocument(fallback.id, archivedLibrary);
        if (!story) {
          this.setState({ error: error || `项目「${fallback.title}」读取失败` });
          return false;
        }
        const syncedLibrary = { ...this.syncLibraryWithStory(archivedLibrary, story), activeProjectId: fallback.id };
        this.resetViewForProject(story, syncedLibrary);
        this.setState({ notice: `已归档「${target.title}」，正在写「${story.title}」` });
        return true;
      }
      const story: StoryDocument = createBlankStory('未命名项目');
      const nextLibrary: ProjectLibrary = {
        ...archivedLibrary,
        activeProjectId: story.id,
        projects: [this.buildMeta(story), ...archivedLibrary.projects],
      };
      if (!this.persistProjectAndLibrary(story, nextLibrary)) return false;
      this.resetViewForProject(story, nextLibrary);
      this.setState({ notice: `已归档「${target.title}」，已为你新建空白项目` });
      return true;
    }
    try {
      this.repository.saveLibrary(archivedLibrary);
    } catch {
      this.setState({ error: '保存失败，但当前编辑仍保留在页面中。' });
      return false;
    }
    this.setState({ library: archivedLibrary, notice: `已归档「${target.title}」` });
    return true;
  }

  unarchiveProject(projectId: string): boolean {
    const library = this.requireLibrary();
    const target = library.projects.find((project) => project.id === projectId);
    if (!target || !target.archived) return false;
    const nextLibrary = {
      ...library,
      projects: library.projects.map((project) => project.id === projectId ? { ...project, archived: false } : project),
    };
    try {
      this.repository.saveLibrary(nextLibrary);
    } catch {
      this.setState({ error: '保存失败，但当前编辑仍保留在页面中。' });
      return false;
    }
    this.setState({ library: nextLibrary, notice: `「${target.title}」已取消归档` });
    return true;
  }

  get visibleCharacters(): StoryCharacter[] {
    const story = this.requireStory();
    const keyword = this.state.search.trim().toLowerCase();
    return story.characters.filter((character) => `${character.name}${character.role}`.toLowerCase().includes(keyword));
  }

  get visibleScenes(): StoryScene[] {
    const story = this.requireStory();
    const keyword = this.state.search.trim().toLowerCase();
    return orderedScenes(story).filter((scene) => `${scene.title}${scene.summary}${scene.conflict}`.toLowerCase().includes(keyword));
  }

  get selectedScene(): StoryScene | null {
    const story = this.state.story;
    return story?.scenes.find((scene) => scene.id === story.selectedSceneId) ?? null;
  }

  get timelineWarning(): string | null {
    const story = this.state.story;
    return story ? getTimelineWarning(story) : null;
  }

  private requireStory(): StoryDocument {
    if (!this.state.story) throw new Error('故事尚未初始化');
    return this.state.story;
  }

  private requireLibrary(): ProjectLibrary {
    if (!this.state.library) throw new Error('项目库尚未初始化');
    return this.state.library;
  }

  /** 读取项目文档；损坏且有有效旧内容时不动旧数据，仅重建该项目的示例内容。 */
  private openProjectDocument(projectId: string, library?: ProjectLibrary | null): { story: StoryDocument | null; error: string } {
    const story = this.repository.loadProject(projectId);
    if (story) return { story, error: '' };
    const meta = (library ?? this.state.library)?.projects.find((project) => project.id === projectId);
    const fallback: StoryDocument = { ...createStarterStory(), id: projectId, title: meta?.title ?? '未命名项目' };
    this.repository.saveProject(fallback);
    return { story: fallback, error: `项目「${fallback.title}」数据损坏，已用示例内容重建。` };
  }

  private resetViewForProject(story: StoryDocument, library: ProjectLibrary): void {
    this.setState({
      status: story.status === 'complete' ? 'completed' : 'ready',
      story,
      stats: getStats(story),
      library,
      search: '',
      activeSection: 'overview',
      error: '',
      notice: this.state.notice,
    });
  }

  private syncLibraryWithStory(library: ProjectLibrary, story: StoryDocument): ProjectLibrary {
    const meta = this.buildMeta(story, library.projects.find((project) => project.id === story.id)?.archived ?? false);
    return {
      ...library,
      activeProjectId: story.id,
      projects: library.projects.some((project) => project.id === story.id)
        ? library.projects.map((project) => project.id === story.id ? meta : project)
        : [meta, ...library.projects],
    };
  }

  private buildMeta(story: StoryDocument, archived = false): ProjectMeta {
    return {
      id: story.id,
      title: story.title,
      status: story.status,
      archived,
      createdAt: story.updatedAt,
      updatedAt: story.updatedAt,
      stats: getStats(story),
    };
  }

  private updateStory(updater: (story: StoryDocument) => StoryDocument, showEditing = true): void {
    const story = updater(this.requireStory());
    this.commitStory(story);
    this.setState({ story, stats: getStats(story), status: showEditing ? 'editing' : this.state.status, error: '' });
  }

  /** 文档与库索引（含完成度/待回收缓存）一起落盘。 */
  private commitStory(story: StoryDocument): void {
    const stamped: StoryDocument = { ...story, updatedAt: new Date().toISOString() };
    const library = this.syncLibraryWithStory(this.requireLibrary(), stamped);
    if (!this.persistProjectAndLibrary(stamped, library)) return;
    this.state = { ...this.state, story: stamped, library, stats: getStats(stamped) };
  }

  /** 切换/归档前强制把当前项目存住，未保存改动不丢。 */
  private flushCurrent(): boolean {
    if (this.state.story) this.commitStory(this.state.story);
    return !this.state.error.includes('保存失败');
  }

  private persistProjectAndLibrary(story: StoryDocument, library: ProjectLibrary): boolean {
    try {
      this.repository.saveProject(story);
      this.repository.saveLibrary(library);
      return true;
    } catch {
      this.setState({ status: 'error', error: '保存失败，但当前编辑仍保留在页面中。' });
      return false;
    }
  }

  private setState(patch: Partial<StoryViewState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}
