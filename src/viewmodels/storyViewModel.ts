import {
  characterColors,
  createId,
  type StoryCharacter,
  type StoryClue,
  type StoryDocument,
  type StoryScene,
} from '../models/story';
import {
  createBlankProject,
  summarizeProject,
  type ProjectLibraryData,
  type ProjectMeta,
  type ProjectSummary,
} from '../models/projectLibrary';
import { getStats, getTimelineWarning, orderedScenes, validateName } from '../models/storyRules';
import type { StoryRepository } from '../repositories/storyRepository';

export type ViewModelStatus = 'loading' | 'ready' | 'editing' | 'error' | 'completed';

export interface StoryViewState {
  status: ViewModelStatus;
  story: StoryDocument | null;
  stats: ReturnType<typeof getStats>;
  notice: string;
  error: string;
  search: string;
  activeSection: 'overview' | 'characters' | 'clues';
  projects: ProjectSummary[];
  activeProjectId: string | null;
  showArchived: boolean;
}

type Listener = () => void;

export class StoryViewModel {
  private state: StoryViewState = {
    status: 'loading',
    story: null,
    stats: { characters: 0, scenes: 0, clues: 0, unresolvedClues: 0, completion: 0 },
    notice: '',
    error: '',
    search: '',
    activeSection: 'overview',
    projects: [],
    activeProjectId: null,
    showArchived: false,
  };
  private readonly listeners = new Set<Listener>();
  private library: ProjectLibraryData | null = null;

  constructor(private readonly repository: StoryRepository) {}

  get snapshot(): StoryViewState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  initialize(): void {
    try {
      const library = this.repository.loadLibrary();
      this.library = library;
      const activeId = this.resolveActiveId(library);
      if (activeId !== library.activeId) {
        library.activeId = activeId;
        this.repository.saveLibrary(library);
      }
      const story = this.repository.loadProject(activeId);
      this.setState({
        status: story.status === 'complete' ? 'completed' : 'ready',
        story,
        stats: getStats(story),
        activeProjectId: activeId,
        projects: this.buildSummaries(library, story),
        error: '',
      });
    } catch {
      this.setState({ status: 'error', error: '项目库读取失败，请检查本地存储。' });
    }
  }

  setSearch(search: string): void {
    this.setState({ search });
  }

  setSection(activeSection: StoryViewState['activeSection']): void {
    this.setState({ activeSection });
  }

  setShowArchived(showArchived: boolean): void {
    this.setState({ showArchived });
  }

  /** 切换前强制把当前项目落盘，任何未落盘改动都会先保存。 */
  switchProject(projectId: string): void {
    if (!this.library || projectId === this.state.activeProjectId) return;
    if (!this.library.projects.some((project) => project.id === projectId)) return;
    this.flushCurrent();
    this.library.activeId = projectId;
    this.repository.saveLibrary(this.library);
    const story = this.repository.loadProject(projectId);
    this.setState({
      status: story.status === 'complete' ? 'completed' : 'ready',
      story,
      stats: getStats(story),
      activeProjectId: projectId,
      projects: this.buildSummaries(this.library, story),
      search: '',
      notice: `已切换到「${story.title}」`,
      error: '',
    });
  }

  createProject(title: string): void {
    const cleanTitle = validateName(title);
    if (cleanTitle === '至少输入 2 个字') {
      this.setState({ notice: cleanTitle });
      return;
    }
    if (!this.library) return;
    this.flushCurrent();
    const { meta, story } = createBlankProject(cleanTitle);
    this.repository.saveProject(story);
    this.library.projects = [...this.library.projects, meta];
    this.library.activeId = story.id;
    this.repository.saveLibrary(this.library);
    this.setState({
      status: 'ready',
      story,
      stats: getStats(story),
      activeProjectId: story.id,
      projects: this.buildSummaries(this.library, story),
      search: '',
      notice: `已新建项目「${story.title}」`,
      error: '',
    });
  }

  renameProject(projectId: string, title: string): void {
    if (!this.library) return;
    const cleanTitle = validateName(title);
    if (cleanTitle === '至少输入 2 个字') {
      this.setState({ notice: cleanTitle });
      return;
    }
    const meta = this.library.projects.find((project) => project.id === projectId);
    if (!meta || meta.title === cleanTitle) return;
    if (projectId === this.state.activeProjectId && this.state.story) {
      const renamed = { ...this.state.story, title: cleanTitle };
      this.persistStory(renamed, true);
      this.setState({ story: renamed, stats: getStats(renamed), projects: this.buildSummaries(this.library, renamed), notice: `项目已重命名为「${cleanTitle}」` });
    } else {
      const story = { ...this.repository.loadProject(projectId), title: cleanTitle, updatedAt: new Date().toISOString() };
      this.repository.saveProject(story);
      this.syncMeta(story);
      this.repository.saveLibrary(this.library);
      this.setState({ projects: this.buildSummaries(this.library, this.state.story ?? undefined), notice: `项目已重命名为「${cleanTitle}」` });
    }
  }

  archiveProject(projectId: string): void {
    if (!this.library) return;
    const meta = this.library.projects.find((project) => project.id === projectId);
    if (!meta || meta.archived) return;
    meta.archived = true;
    if (projectId !== this.state.activeProjectId) {
      this.repository.saveLibrary(this.library);
      this.setState({ projects: this.buildSummaries(this.library, this.state.story ?? undefined), notice: `「${meta.title}」已归档` });
      return;
    }
    this.flushCurrent();
    const next = this.library.projects.find((project) => !project.archived);
    if (next) {
      this.library.activeId = next.id;
      this.repository.saveLibrary(this.library);
      const story = this.repository.loadProject(next.id);
      this.setState({
        status: story.status === 'complete' ? 'completed' : 'ready',
        story,
        stats: getStats(story),
        activeProjectId: next.id,
        projects: this.buildSummaries(this.library, story),
        notice: `「${meta.title}」已归档，已切换到「${story.title}」`,
        error: '',
      });
    } else {
      // 当前唯一项目被归档：自动准备一个空白新项目承接工作台。
      const { meta: blankMeta, story } = createBlankProject('未命名项目');
      this.repository.saveProject(story);
      this.library.projects = [...this.library.projects, blankMeta];
      this.library.activeId = story.id;
      this.repository.saveLibrary(this.library);
      this.setState({
        status: 'ready',
        story,
        stats: getStats(story),
        activeProjectId: story.id,
        projects: this.buildSummaries(this.library, story),
        notice: `「${meta.title}」已归档，已新建空白项目`,
        error: '',
      });
    }
  }

  restoreProject(projectId: string): void {
    if (!this.library) return;
    const meta = this.library.projects.find((project) => project.id === projectId);
    if (!meta || !meta.archived) return;
    meta.archived = false;
    this.repository.saveLibrary(this.library);
    this.setState({ projects: this.buildSummaries(this.library, this.state.story ?? undefined), notice: `「${meta.title}」已恢复` });
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

  /** 页面关闭/切走前再兜一次底，保证内存中的改动一定落盘。 */
  flushBeforeUnload(): void {
    this.flushCurrent();
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

  private resolveActiveId(library: ProjectLibraryData): string {
    if (library.projects.some((project) => project.id === library.activeId)) return library.activeId;
    return library.projects.find((project) => !project.archived)?.id ?? library.projects[0]?.id ?? '';
  }

  /** 汇总各项目完成度与待回收伏笔；当前项目取内存，其余从存储读取。 */
  private buildSummaries(library: ProjectLibraryData, activeStory?: StoryDocument): ProjectSummary[] {
    const summaries = library.projects.map((meta) => {
      const story = meta.id === activeStory?.id ? activeStory : this.repository.loadProject(meta.id);
      return summarizeProject(meta, getStats(story));
    });
    return summaries.sort((a, b) => {
      if (a.archived !== b.archived) return a.archived ? 1 : -1;
      if (a.id === library.activeId) return -1;
      if (b.id === library.activeId) return 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }

  private requireStory(): StoryDocument {
    if (!this.state.story) throw new Error('故事尚未初始化');
    return this.state.story;
  }

  private updateStory(updater: (story: StoryDocument) => StoryDocument, showEditing = true, syncIndex = true): void {
    const story = updater(this.requireStory());
    this.persistStory(story, syncIndex);
    this.setState({
      story,
      stats: getStats(story),
      status: showEditing ? 'editing' : this.state.status,
      projects: syncIndex && this.library ? this.buildSummaries(this.library, story) : this.state.projects,
      error: '',
    });
  }

  private persistStory(story: StoryDocument, syncIndex: boolean): void {
    const stamped: StoryDocument = { ...story, updatedAt: new Date().toISOString() };
    try {
      this.repository.saveProject(stamped);
      if (syncIndex && this.library) {
        this.syncMeta(stamped);
        this.repository.saveLibrary(this.library);
      }
    } catch {
      this.setState({ status: 'error', error: '保存失败，但当前编辑仍保留在页面中。' });
    }
  }

  private syncMeta(story: StoryDocument): void {
    if (!this.library) return;
    this.library.projects = this.library.projects.map((project) =>
      project.id === story.id
        ? { ...project, title: story.title, status: story.status, updatedAt: story.updatedAt } satisfies ProjectMeta
        : project,
    );
  }

  private flushCurrent(): void {
    if (!this.state.story) return;
    const stamped = { ...this.state.story, updatedAt: new Date().toISOString() };
    try {
      this.repository.saveProject(stamped);
      if (this.library) {
        this.syncMeta(stamped);
        this.repository.saveLibrary(this.library);
      }
    } catch {
      // 落盘失败时不阻断切换，内存中的内容在当前会话仍可用。
    }
  }

  private setState(patch: Partial<StoryViewState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}
