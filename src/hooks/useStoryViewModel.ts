import { useEffect, useState } from 'react';
import { LocalStoryRepository } from '../repositories/storyRepository';
import { BrowserProjectStorage } from '../services/storageService';
import { StoryViewModel } from '../viewmodels/storyViewModel';

const viewModel = new StoryViewModel(new LocalStoryRepository(new BrowserProjectStorage()));

export function useStoryViewModel(): StoryViewModel {
  const [, refresh] = useState(0);
  useEffect(() => {
    const unsubscribe = viewModel.subscribe(() => refresh((value) => value + 1));
    const flush = () => viewModel.flushBeforeUnload();
    window.addEventListener('beforeunload', flush);
    viewModel.initialize();
    return () => {
      window.removeEventListener('beforeunload', flush);
      unsubscribe();
    };
  }, []);
  return viewModel;
}
