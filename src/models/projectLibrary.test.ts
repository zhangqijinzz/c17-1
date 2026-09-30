import { describe, expect, it } from 'vitest';
import {
  bootstrapLibraryFromLegacy,
  createBlankProject,
  sanitizeLibrary,
} from './projectLibrary';
import { createStarterStory } from './story';
import { sanitizeStory } from './storyRules';

describe('project library', () => {
  it('turns the legacy document into the first project', () => {
    const legacy = createStarterStory();
    const { library, story } = bootstrapLibraryFromLegacy(legacy, sanitizeStory);
    expect(library.version).toBe(1);
    expect(library.activeId).toBe(legacy.id);
    expect(library.projects).toHaveLength(1);
    expect(library.projects[0].title).toBe(legacy.title);
    expect(story.id).toBe(legacy.id);
  });

  it('creates blank projects with empty structure', () => {
    const { meta, story } = createBlankProject('新本');
    expect(meta.id).toBe(story.id);
    expect(story.scenes).toHaveLength(0);
    expect(story.characters).toHaveLength(0);
    expect(story.clues).toHaveLength(0);
    expect(meta.archived).toBe(false);
  });

  it('rejects malformed libraries', () => {
    expect(sanitizeLibrary(null)).toBeNull();
    expect(sanitizeLibrary({ version: 1, activeId: 'x', projects: [] })).toBeNull();
    expect(sanitizeLibrary({ version: 99, activeId: 'x', projects: [{ id: 'x' }] })).toBeNull();
    const valid = bootstrapLibraryFromLegacy(createStarterStory(), sanitizeStory).library;
    expect(sanitizeLibrary(valid)).not.toBeNull();
  });
});
