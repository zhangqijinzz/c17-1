import type { StoryStats } from '../models/story';
import type { StoryViewModel } from '../viewmodels/storyViewModel';
import { ProjectLibrary } from './ProjectLibrary';

interface SidebarProps {
  viewModel: StoryViewModel;
  stats: StoryStats;
}

export function Sidebar({ viewModel, stats }: SidebarProps) {
  const { activeSection } = viewModel.snapshot;
  return (
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">✦</span><span>StoryArchitect</span></div>
      <ProjectLibrary viewModel={viewModel} />
      <nav className="side-nav" aria-label="主要导航">
        <button className={activeSection === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => viewModel.setSection('overview')}><span>◈</span>故事总览</button>
        <button className={activeSection === 'characters' ? 'nav-item active' : 'nav-item'} onClick={() => viewModel.setSection('characters')}><span>♧</span>人物关系</button>
        <button className={activeSection === 'clues' ? 'nav-item active' : 'nav-item'} onClick={() => viewModel.setSection('clues')}><span>⌁</span>伏笔关系</button>
      </nav>
      <div className="sidebar-bottom">
        <div className="mini-progress"><div><span>当前项目完成度</span><b>{stats.completion}%</b></div><div className="progress-track"><span style={{ width: `${stats.completion}%` }} /></div></div>
        <span className="saved-state">● 切换前自动落盘 · 本地保存</span>
      </div>
    </aside>
  );
}
