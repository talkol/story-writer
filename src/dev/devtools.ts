import { normalizeCover, putCover } from '../storage/covers.idb';
import { getSnapshot, replaceAll, updateStory } from '../storage/stories';
import { FIXTURE_STORIES } from './fixtures';
import { selftest } from './selftest';

/**
 * Dev-only entry point. Reachable exclusively through a dynamic import guarded by
 * `import.meta.env.DEV`, so Rollup drops this module — and the fixture prose — from
 * production bundles entirely.
 */

/**
 * Paints a stand-in "illustrated" cover. Its only job is to put a real Blob through
 * the real pipeline (canvas -> normalizeCover -> IndexedDB -> object URL) so the
 * image path in the library is exercised in dev, not just the placeholder path.
 */
async function paintCover(seed: number, palette: [string, string]): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1536;
  const ctx = canvas.getContext('2d')!;

  const sky = ctx.createLinearGradient(0, 0, 0, 1536);
  sky.addColorStop(0, palette[0]);
  sky.addColorStop(1, palette[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 1536);

  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.arc(700, 380, 150, 0, Math.PI * 2);
  ctx.fill();

  // Deterministic ridgeline, so reseeding produces the same covers every time.
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath();
  ctx.moveTo(0, 1536);
  for (let x = 0; x <= 1024; x += 32) {
    const h = 1080 + Math.sin((x + seed * 90) / 150) * 130 + Math.sin(x / 47) * 45;
    ctx.lineTo(x, h);
  }
  ctx.lineTo(1024, 1536);
  ctx.closePath();
  ctx.fill();

  return new Promise((r) => canvas.toBlob((b) => r(b!), 'image/png'));
}

export async function seedFixtures(): Promise<void> {
  replaceAll(FIXTURE_STORIES.map((s) => structuredClone(s)));

  // Two of the three get an image; the third stays coverless so the placeholder
  // and the "generation failed" state stay visible during development.
  const covers: Array<[string, [string, string]]> = [
    ['fixture-lantern', ['#2a4a72', '#0a1420']],
    ['fixture-biscuit', ['#6fa84a', '#1f3a15']],
  ];

  await Promise.all(
    covers.map(async ([storyId, palette], i) => {
      const coverId = `cover-${storyId}`;
      await putCover(coverId, await normalizeCover(await paintCover(i + 1, palette)));
      updateStory(storyId, { coverImageId: coverId });
    }),
  );
}

export function seedIfEmpty(): void {
  if (getSnapshot().length === 0) void seedFixtures();
}

export function install(): void {
  seedIfEmpty();
  window.__dev = { seedFixtures, clearStories: () => replaceAll([]), selftest };
  console.info('[dev] window.__dev ready — try __dev.selftest()');
}

declare global {
  interface Window {
    __dev: {
      seedFixtures: () => Promise<void>;
      clearStories: () => void;
      selftest: typeof selftest;
    };
  }
}
