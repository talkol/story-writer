import { getSnapshot, replaceAll } from '../storage/stories';
import { FIXTURE_STORIES } from './fixtures';
import { selftest } from './selftest';

/**
 * Dev-only entry point. Reachable exclusively through a dynamic import guarded by
 * `import.meta.env.DEV`, so Rollup drops this module — and the fixture prose — from
 * production bundles entirely.
 */

export function seedFixtures(): void {
  replaceAll(FIXTURE_STORIES.map((s) => structuredClone(s)));
}

export function seedIfEmpty(): void {
  if (getSnapshot().length === 0) seedFixtures();
}

export function install(): void {
  seedIfEmpty();
  window.__dev = { seedFixtures, clearStories: () => replaceAll([]), selftest };
  console.info('[dev] window.__dev ready — try __dev.selftest()');
}

declare global {
  interface Window {
    __dev: {
      seedFixtures: () => void;
      clearStories: () => void;
      selftest: typeof selftest;
    };
  }
}
