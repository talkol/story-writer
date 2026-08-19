import { useSyncExternalStore } from 'react';
import type { Story } from '../types';
import { getSnapshot, getStory, subscribe } from './stories';

/** The library, newest-updated first. Re-renders on any mutation to the store. */
export function useStories(): Story[] {
  const stories = useSyncExternalStore(subscribe, getSnapshot);
  return [...stories].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function useStory(id: string | undefined): Story | undefined {
  useSyncExternalStore(subscribe, getSnapshot);
  return id ? getStory(id) : undefined;
}
