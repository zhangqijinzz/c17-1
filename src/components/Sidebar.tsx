import { useEffect, useRef, useState } from 'react';
import type { ProjectMeta } from '../models/projectLibrary';
import type { StoryViewModel } from '../viewmodels/storyViewModel';

function ProjectStats({ project, dimmed = false }: { project: ProjectMeta; dimmed?: boolean }) {
  const { stats } = project;
  return (
    <div className={dimmed ? 'project-meta dimmed' : 'project-meta'}>
      <span className="completion-chip">{stats.completion}%</span>
      <span className="progress-track"><span style={{ width: `${stats.completion}%` }} /></span>
      <span className={stats.unresolvedClues > 0 ? 'unresolved-chip' : 'unresolved-chip resolved'}>
        ◌ {stats.unresolvedClues} 待回收
      </span>
    </div>
  );
}

function ProjectRow({
  project,
  active,
  viewModel,
}: {
  project: ProjectMeta;
  active: boolean;
  viewModel: StoryViewModel;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(project.title);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, project.title]);

  const commitRename = () => {
    if (viewModel.renameProject(project.id, draft)) setEditing(false);
  };

  if (editing) {
    return (
      <div className="project-row editing">
        <input
          ref={inputRef}
          className="project-rename-input"
          value={draft}
          aria-label="重命名项目"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitRename();
            if (event.key === 'Escape') setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className={active ? 'project-row active' : 'project-row'}>
      <button className="project-open" onClick={() => viewModel.switchProject(project.id)} title={active ? '正在编辑' : `切换到「${project.title}」`}>
        <span className="project-name">{project.title}</span>
        <ProjectStats project={project} />
      </button>
      <div className="project-row-actions">
        <button aria-label={`重命名「${project.title}」`} title="重命名" onClick={() => setEditing(true)}>✎</button>
        <button aria-label={`归档「${project.title}」`} title="归档" onClick={() => viewModel.archiveProject(project.id)}>⌫</button>
      </div>
      {active && <span className="active-flag">在写</span>}
    </div>
  );
}

export function Sidebar({ viewModel }: { viewModel: StoryViewModel }) {
  const { story, activeSection, library, projectSwitcherOpen } = viewModel.snapshot;
  const activeProject = viewModel.activeProject;
  const [newTitle, setNewTitle] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectSwitcherOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        viewModel.setProjectSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [projectSwitcherOpen, viewModel]);

  const activeProjects = library?.projects.filter((project) => !project.archived) ?? [];
  const archivedProjects = library?.projects.filter((project) => project.archived) ?? [];

  const createProject = () => {
    if (viewModel.createProject(newTitle)) setNewTitle('');
  };

  return (
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">✦</span><span>StoryArchitect</span></div>

      <div className="project-library" ref={panelRef}>
        <button
          className="project-switcher"
          aria-expanded={projectSwitcherOpen}
          onClick={() => viewModel.setProjectSwitcherOpen(!projectSwitcherOpen)}
        >
          <span className="eyebrow">当前项目 · 点击切换</span>
          <strong>{story?.title ?? '正在加载…'}</strong>
          <span className="project-dot" />
          <span className="switcher-caret">{projectSwitcherOpen ? '▲' : '▼'}</span>
          {activeProject && <ProjectStats project={activeProject} />}
        </button>

        {projectSwitcherOpen && (
          <div className="project-panel" role="dialog" aria-label="项目库">
            <div className="project-create">
              <input
                aria-label="新项目名称"
                placeholder="新本子的名字…"
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && createProject()}
              />
              <button onClick={createProject}>＋ 新建</button>
            </div>

            <div className="project-groups">
              <div className="project-group">
                <span className="project-group-label">进行中 · {activeProjects.length}</span>
                {activeProjects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    active={project.id === library?.activeProjectId}
                    viewModel={viewModel}
                  />
                ))}
              </div>

              {archivedProjects.length > 0 && (
                <div className="project-group archived-group">
                  <span className="project-group-label">已归档 · {archivedProjects.length}</span>
                  {archivedProjects.map((project) => (
                    <div className="project-row archived" key={project.id}>
                      <span className="project-name">{project.title}</span>
                      <ProjectStats project={project} dimmed />
                      <div className="project-row-actions">
                        <button aria-label={`取消归档「${project.title}」`} title="取消归档" onClick={() => viewModel.unarchiveProject(project.id)}>↺</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <span className="saved-state">● 切换项目时自动保存当前改动</span>
          </div>
        )}
      </div>

      <nav className="side-nav" aria-label="主要导航">
        <button className={activeSection === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => viewModel.setSection('overview')}><span>◈</span>故事总览</button>
        <button className={activeSection === 'characters' ? 'nav-item active' : 'nav-item'} onClick={() => viewModel.setSection('characters')}><span>♧</span>人物关系</button>
        <button className={activeSection === 'clues' ? 'nav-item active' : 'nav-item'} onClick={() => viewModel.setSection('clues')}><span>⌁</span>伏笔关系</button>
      </nav>
      <div className="sidebar-bottom">
        <span className="saved-state">● 本地自动保存 · 共 {library?.projects.length ?? 0} 个项目</span>
      </div>
    </aside>
  );
}
