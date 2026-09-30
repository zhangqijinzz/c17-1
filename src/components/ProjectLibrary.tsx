import { useEffect, useRef, useState } from 'react';
import type { ProjectSummary } from '../models/projectLibrary';
import type { StoryViewModel } from '../viewmodels/storyViewModel';

interface ProjectLibraryProps {
  viewModel: StoryViewModel;
}

export function ProjectLibrary({ viewModel }: ProjectLibraryProps) {
  const { projects, activeProjectId, showArchived } = viewModel.snapshot;
  const [newTitle, setNewTitle] = useState('');
  const visibleProjects = showArchived ? projects : projects.filter((project) => !project.archived);
  const archivedCount = projects.filter((project) => project.archived).length;

  const submit = () => {
    viewModel.createProject(newTitle);
    setNewTitle('');
  };

  return (
    <div className="project-library">
      <div className="pl-heading">
        <span className="eyebrow">项目库 · {projects.length}</span>
      </div>
      <div className="pl-create">
        <input
          aria-label="新项目名称"
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && submit()}
          placeholder="新本名称…"
        />
        <button className="pl-add" onClick={submit} aria-label="新建项目">＋</button>
      </div>
      <div className="pl-list">
        {visibleProjects.map((project) => (
          <ProjectItem
            key={project.id}
            project={project}
            active={project.id === activeProjectId}
            viewModel={viewModel}
          />
        ))}
        {visibleProjects.length === 0 && <div className="pl-empty">{showArchived ? '还没有任何项目。' : '没有进行中的项目。'}</div>}
      </div>
      {archivedCount > 0 && (
        <button className="pl-toggle" onClick={() => viewModel.setShowArchived(!showArchived)}>
          {showArchived ? '隐藏归档' : `查看归档（${archivedCount}）`}
        </button>
      )}
    </div>
  );
}

interface ProjectItemProps {
  project: ProjectSummary;
  active: boolean;
  viewModel: StoryViewModel;
}

function ProjectItem({ project, active, viewModel }: ProjectItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (editing) {
      cancelledRef.current = false;
      inputRef.current?.focus();
    }
  }, [editing]);

  const commit = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    viewModel.renameProject(project.id, draft);
    setDraft(project.title);
    setEditing(false);
  };

  const cancel = () => {
    cancelledRef.current = true;
    setDraft(project.title);
    setEditing(false);
  };

  const unresolved = project.stats.unresolvedClues;
  return (
    <div
      className={active ? 'pl-item active' : 'pl-item'}
      role="button"
      tabIndex={0}
      onClick={() => !editing && viewModel.switchProject(project.id)}
      onKeyDown={(event) => {
        if (!editing && (event.key === 'Enter' || event.key === ' ')) viewModel.switchProject(project.id);
      }}
    >
      <div className="pl-item-top">
        {editing ? (
          <input
            ref={inputRef}
            className="pl-rename"
            value={draft}
            aria-label="重命名项目"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
              if (event.key === 'Escape') cancel();
            }}
            onBlur={commit}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <strong title={project.title}>{project.title}</strong>
        )}
        {active && !editing && <span className="pl-dot" />}
      </div>
      {!editing && (
        <>
          <div className="pl-meta">
            <span className="pl-pct">{project.stats.completion}%</span>
            <span className={unresolved > 0 ? 'pl-unresolved alert' : 'pl-unresolved'}>
              <i />待回收 {unresolved}
            </span>
            {project.status === 'complete' && <em className="pl-badge done">已完成</em>}
            {project.archived && <em className="pl-badge archived">已归档</em>}
          </div>
          <div className="progress-track pl-track"><span style={{ width: `${project.stats.completion}%` }} /></div>
          <div className="pl-actions">
            <button
              onClick={(event) => { event.stopPropagation(); setDraft(project.title); setEditing(true); }}
              title="重命名"
            >重命名</button>
            {project.archived ? (
              <button
                onClick={(event) => { event.stopPropagation(); viewModel.restoreProject(project.id); }}
                title="恢复项目"
              >恢复</button>
            ) : (
              <button
                onClick={(event) => { event.stopPropagation(); viewModel.archiveProject(project.id); }}
                title="归档项目"
              >归档</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
