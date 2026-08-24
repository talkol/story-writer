import { AUDIENCE_PROFILE, type Audience, type Genre, type Setting, type Story } from '../types';
import { STORIES_KEY } from './keys';
import { migrateWithMeta, wrap } from './migrations';
import { readLocal, writeLocal } from './quota';

/**
 * Single source of truth for the library. Holds the collection in memory and mirrors
 * every mutation to localStorage. Exposes subscribe/getSnapshot so screens can bind
 * with useSyncExternalStore without a state library.
 */

let cache: Story[] | null = null;
const listeners = new Set<() => void>();

function read(): Story[] {
  if (cache) return cache;
  const { data, upgraded } = migrateWithMeta<Story[]>(readLocal(STORIES_KEY));
  cache = Array.isArray(data) ? data : [];

  if (upgraded) {
    // Persist the migrated shape so storage converges on the current schema.
    // Deliberately not via commit(): read() can run during render (getSnapshot),
    // and notifying subscribers there would be a state update mid-render. The
    // data is already what the cache holds, so there is nothing to notify about.
    try {
      writeLocal(STORIES_KEY, JSON.stringify(wrap(cache)));
    } catch (err) {
      // A full disk is not a reason to fail the read; the in-memory data is correct.
      console.warn('[storage] could not persist migrated stories', err);
    }
  }

  return cache;
}

function commit(next: Story[]): void {
  // Persist first: if the quota write throws, the in-memory cache stays consistent
  // with what is actually on disk and the caller sees the error.
  writeLocal(STORIES_KEY, JSON.stringify(wrap(next)));
  cache = next;
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Stable-identity snapshot, required by useSyncExternalStore. */
export function getSnapshot(): Story[] {
  return read();
}

export function listStories(): Story[] {
  return [...read()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getStory(id: string): Story | undefined {
  return read().find((s) => s.id === id);
}

/**
 * A random id.
 *
 * `crypto.randomUUID` is only defined in a secure context — HTTPS or localhost. Open
 * the dev server from another device on the network (`http://192.168.x.x:5173`) and it
 * is simply missing, which would break creating a story, awarding an achievement and
 * storing a cover. `crypto.getRandomValues` has no such restriction, so the fallback
 * builds the same v4 shape from it.
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  // Version 4, variant 1, per RFC 4122.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createStory(input: {
  audience: Audience;
  genre: Genre;
  setting: Setting;
}): Story {
  const now = Date.now();
  const story: Story = {
    id: newId(),
    title: '',
    coverImageId: null,
    audience: input.audience,
    genre: input.genre,
    setting: input.setting,
    totalChapters: AUDIENCE_PROFILE[input.audience].totalChapters,
    chapters: [],
    achievements: [],
    pendingActions: [],
    summary: '',
    status: 'draft',
    readingPosition: { chapterIndex: 0, wordOffset: 0 },
    createdAt: now,
    updatedAt: now,
  };
  commit([...read(), story]);
  return story;
}

/** Applies a partial patch, or a reducer for updates that depend on current state. */
export function updateStory(
  id: string,
  patch: Partial<Story> | ((current: Story) => Partial<Story>),
): Story | undefined {
  const stories = read();
  const index = stories.findIndex((s) => s.id === id);
  if (index === -1) return undefined;

  const current = stories[index];
  const delta = typeof patch === 'function' ? patch(current) : patch;
  const updated: Story = { ...current, ...delta, id: current.id, updatedAt: Date.now() };

  const next = [...stories];
  next[index] = updated;
  commit(next);
  return updated;
}

export function removeStory(id: string): void {
  commit(read().filter((s) => s.id !== id));
}

export function replaceAll(stories: Story[]): void {
  commit(stories);
}

/** Test/dev seam — drops the in-memory cache so the next read re-hydrates. */
export function invalidate(): void {
  cache = null;
  listeners.forEach((fn) => fn());
}
