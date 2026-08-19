import { deleteCover, getCover, normalizeCover, putCover } from '../storage/covers.idb';
import { migrate, wrap } from '../storage/migrations';
import { loadSettings, saveSettings } from '../storage/settings';
import {
  createStory,
  getSnapshot,
  getStory,
  removeStory,
  replaceAll,
  updateStory,
} from '../storage/stories';
import type { Story } from '../types';

/**
 * Dev-only smoke test for the persistence layer. Exposed as window.__selftest() so the
 * storage contract can be verified in a real browser (localStorage quirks, IndexedDB,
 * canvas encoding) rather than in a mocked environment.
 */

type Result = { name: string; pass: boolean; detail?: string };

function check(name: string, pass: boolean, detail?: string): Result {
  return { name, pass, detail };
}

export async function selftest(): Promise<{ passed: number; failed: number; results: Result[] }> {
  const results: Result[] = [];
  // Snapshot the caller's real data. Restoring fixtures here would silently destroy
  // a populated library.
  const savedStories = structuredClone(getSnapshot());
  const savedSettings = loadSettings();

  try {

    // --- migrations -----------------------------------------------------------
    results.push(check('migrate: null input', migrate<unknown>(null) === null));
    results.push(check('migrate: garbage input', migrate<unknown>('}{not json') === null));
    results.push(
      check(
        'migrate: future version refused',
        migrate<unknown>(JSON.stringify({ schemaVersion: 99, data: [1] })) === null,
      ),
    );
    results.push(
      check(
        'migrate: round-trips current envelope',
        JSON.stringify(migrate<number[]>(JSON.stringify(wrap([1, 2, 3])))) === '[1,2,3]',
      ),
    );
    const legacy = migrate<{ a: number }>(JSON.stringify({ a: 1 }));
    results.push(check('migrate: bare v0 payload adopted', legacy?.a === 1));

    // --- story store ----------------------------------------------------------
    const created = createStory({ audience: 'Children', genre: 'Comedy', setting: 'Space' });
    results.push(check('createStory: totalParts from audience', created.totalParts === 10));
    results.push(check('createStory: readable back', getStory(created.id)?.id === created.id));

    updateStory(created.id, { title: 'Renamed' });
    results.push(check('updateStory: patch applied', getStory(created.id)?.title === 'Renamed'));

    updateStory(created.id, (s) => ({ summary: `${s.title} summary` }));
    results.push(
      check('updateStory: reducer form', getStory(created.id)?.summary === 'Renamed summary'),
    );

    const beforeReload = getStory(created.id);
    const reparsed = migrate<Story[]>(localStorage.getItem('story-app:stories'));
    results.push(
      check(
        'store: mutation reached localStorage',
        reparsed?.some((s) => s.id === created.id && s.title === 'Renamed') === true,
        `${reparsed?.length} stories on disk`,
      ),
    );
    results.push(check('updateStory: bumps updatedAt', (beforeReload?.updatedAt ?? 0) > 0));

    removeStory(created.id);
    results.push(check('removeStory: gone', getStory(created.id) === undefined));

    // --- settings -------------------------------------------------------------
    saveSettings({ apiKey: 'sk-test-value', fontScale: 1.15 });
    const reloaded = loadSettings();
    results.push(check('settings: key persists', reloaded.apiKey === 'sk-test-value'));
    results.push(check('settings: fontScale persists', reloaded.fontScale === 1.15));
    saveSettings({ apiKey: null, fontScale: 1 });
    results.push(check('settings: empty key normalises to null', loadSettings().apiKey === null));

    // --- covers (IndexedDB + canvas downscale) --------------------------------
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1536;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#3a2f1c';
    ctx.fillRect(0, 0, 1024, 1536);
    ctx.fillStyle = '#d3a06a';
    ctx.fillRect(120, 300, 780, 600);
    const source = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));

    const normalized = await normalizeCover(source);
    results.push(
      check(
        'cover: downscale shrinks payload',
        normalized.size < source.size && normalized.size < 120_000,
        `${Math.round(source.size / 1024)}KB PNG -> ${Math.round(normalized.size / 1024)}KB JPEG`,
      ),
    );
    results.push(check('cover: re-encoded as jpeg', normalized.type === 'image/jpeg'));

    const bitmap = await createImageBitmap(normalized);
    results.push(
      check(
        'cover: 2:3 portrait enforced',
        bitmap.width === 512 && bitmap.height === 768,
        `${bitmap.width}x${bitmap.height}`,
      ),
    );
    bitmap.close();

    await putCover('selftest-cover', normalized);
    const fetched = await getCover('selftest-cover');
    results.push(check('cover: idb round-trip', fetched?.size === normalized.size));
    await deleteCover('selftest-cover');
    results.push(check('cover: idb delete', (await getCover('selftest-cover')) === undefined));

  } finally {
    // Runs even if an assertion above throws — never leave the caller's library in
    // whatever state the test happened to reach.
    replaceAll(savedStories);
    saveSettings(savedSettings);
  }

  const failed = results.filter((r) => !r.pass);
  console.table(results);
  console.log(`${results.length - failed.length}/${results.length} passed`);
  return { passed: results.length - failed.length, failed: failed.length, results };
}

declare global {
  interface Window {
    __selftest: typeof selftest;
  }
}
