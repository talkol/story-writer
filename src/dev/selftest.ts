import { applyChapter } from '../ai/generate';
import { displayableProse, MetaFormatError, parseMeta, splitOnDelimiter } from '../ai/parse';
import { buildContext, buildSystemPrompt, buildUserPrompt } from '../ai/prompts';
import { buildPages } from '../reader/pages';
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

/** True when `fn` throws a MetaFormatError, which is the only failure we accept. */
function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch (err) {
    return err instanceof MetaFormatError;
  }
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

    // v1 -> v2: "part" became "chapter". A v1 story must survive intact.
    const v1Story = {
      schemaVersion: 1,
      data: [
        {
          id: 'legacy-1',
          title: 'Old Book',
          parts: [{ kind: 'prose', index: 0, text: 'once upon a time' }],
          totalParts: 20,
          genreChangedAtPart: 4,
          readingPosition: { partIndex: 2, wordOffset: 55 },
          achievements: [{ id: 'a1', title: 'First', description: 'x', unlockedAtPart: 3 }],
          summary: 'a summary',
        },
      ],
    };
    const up = migrate<Story[]>(JSON.stringify(v1Story))?.[0] as unknown as Record<
      string,
      unknown
    >;
    const pos = up?.readingPosition as Record<string, unknown> | undefined;
    const ach = (up?.achievements as Array<Record<string, unknown>> | undefined)?.[0];
    results.push(
      check(
        'migrate v1->v2: parts -> chapters',
        Array.isArray(up?.chapters) && (up.chapters as unknown[]).length === 1 && !('parts' in up),
      ),
    );
    results.push(
      check(
        'migrate v1->v2: totalParts -> totalChapters',
        up?.totalChapters === 20 && !('totalParts' in up),
      ),
    );
    results.push(
      check(
        'migrate v1->v2: reading position anchored',
        pos?.chapterIndex === 2 && pos?.wordOffset === 55,
      ),
    );
    results.push(check('migrate v1->v2: achievement renamed', ach?.unlockedAtChapter === 3));
    results.push(
      check('migrate v1->v2: genre-shift marker renamed', up?.genreChangedAtChapter === 4),
    );
    results.push(
      check(
        'migrate v1->v2: untouched fields preserved',
        up?.title === 'Old Book' && up?.summary === 'a summary',
      ),
    );

    // --- story store ----------------------------------------------------------
    const created = createStory({ audience: 'Children', genre: 'Comedy', setting: 'Space' });
    results.push(check('createStory: totalChapters from audience', created.totalChapters === 10));
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

    // --- AI: delimited stream format ------------------------------------------
    const withMeta = 'The bell rang.\n\n===META===\n{"actions":[]}';
    results.push(
      check(
        'parse: splits prose from meta',
        splitOnDelimiter(withMeta).prose.trim() === 'The bell rang.' &&
          splitOnDelimiter(withMeta).metaRaw?.trim() === '{"actions":[]}',
      ),
    );
    results.push(
      check(
        'parse: tolerates loose delimiter',
        splitOnDelimiter('a\n== META ==\n{}').metaRaw?.trim() === '{}',
      ),
    );
    results.push(
      check('parse: no delimiter yields null meta', splitOnDelimiter('just prose').metaRaw === null),
    );

    // While streaming, a delimiter forming at the tail must not reach the reader.
    results.push(
      check('parse: withholds partial delimiter', displayableProse('The bell rang.\n===ME') === 'The bell rang.'),
    );
    results.push(
      check('parse: passes prose through untouched', displayableProse('The bell rang.') === 'The bell rang.'),
    );
    results.push(
      check(
        'parse: an equals sign mid-prose is not a delimiter',
        displayableProse('x = 3 and more text') === 'x = 3 and more text',
      ),
    );

    // --- AI: metadata validation ----------------------------------------------
    const goodMeta = JSON.stringify({
      title: 'The Drowned Bell',
      actions: ['a', 'b', 'c', 'd'],
      achievement: { title: 'First Step', description: 'You began.' },
      summary: 'A summary.',
    });
    const parsed = parseMeta(goodMeta, { title: true, actions: true });
    results.push(
      check(
        'meta: parses a well-formed block',
        parsed.title === 'The Drowned Bell' &&
          parsed.actions.length === 4 &&
          parsed.achievement?.title === 'First Step',
      ),
    );
    results.push(
      check(
        'meta: strips code fences',
        parseMeta('```json\n' + goodMeta + '\n```', { title: true, actions: true }).summary ===
          'A summary.',
      ),
    );
    results.push(
      check('meta: rejects wrong action count', throws(() =>
        parseMeta(JSON.stringify({ actions: ['a'], summary: 's' }), { title: false, actions: true }),
      )),
    );
    results.push(
      check('meta: rejects missing summary', throws(() =>
        parseMeta(JSON.stringify({ actions: ['a', 'b', 'c', 'd'] }), { title: false, actions: true }),
      )),
    );
    results.push(
      check('meta: rejects invalid JSON', throws(() => parseMeta('not json', { title: false, actions: false }))),
    );
    results.push(
      check(
        'meta: drops a malformed achievement without failing',
        parseMeta(JSON.stringify({ actions: [], summary: 's', achievement: { title: 'x' } }), {
          title: false,
          actions: false,
        }).achievement === null,
      ),
    );
    results.push(
      check(
        'meta: final chapter discards stray actions',
        parseMeta(JSON.stringify({ actions: ['a', 'b'], summary: 's' }), {
          title: false,
          actions: false,
        }).actions.length === 0,
      ),
    );

    // --- AI: prompt assembly ---------------------------------------------------
    const promptStory = createStory({ audience: 'Children', genre: 'Comedy', setting: 'Space' });
    const ctx1 = buildContext(promptStory);
    results.push(
      check(
        'prompt: first chapter asks for a title',
        ctx1.needsTitle && ctx1.chapterNumber === 1 && ctx1.wordTarget === 250,
      ),
    );
    results.push(
      check(
        'prompt: system prompt carries genre and length',
        buildSystemPrompt(promptStory, ctx1).includes('chapter 1 of 10') &&
          buildSystemPrompt(promptStory, ctx1).includes('GENRE: Comedy'),
      ),
    );
    results.push(
      check(
        'prompt: chosen action reaches the model',
        buildUserPrompt({ ...promptStory, chapters: [{ kind: 'prose', index: 0, text: 'x' }] }, {
          ...ctx1,
          chapterNumber: 2,
        }, 'Open the hatch.').includes('Open the hatch.'),
      ),
    );

    // --- AI: committing a generated chapter ------------------------------------
    applyChapter(promptStory, {
      prose: 'Once upon a time.',
      meta: {
        title: 'Biscuit in Space',
        actions: ['a', 'b', 'c', 'd'],
        achievement: { title: 'Lift Off', description: 'You left the ground.' },
        summary: 'Rabbit goes up.',
      },
      metaMissing: false,
    });
    const afterOne = getStory(promptStory.id)!;
    results.push(
      check(
        'apply: chapter, title, summary and actions committed',
        afterOne.title === 'Biscuit in Space' &&
          afterOne.summary === 'Rabbit goes up.' &&
          afterOne.pendingActions.length === 4 &&
          afterOne.status === 'reading',
      ),
    );
    results.push(
      check(
        'apply: achievement becomes a page and an entry',
        afterOne.chapters.length === 2 &&
          afterOne.chapters[1].kind === 'achievement' &&
          afterOne.achievements[0]?.unlockedAtChapter === 1,
      ),
    );

    // Pacing guard: a second achievement one chapter later must be refused.
    applyChapter(afterOne, {
      prose: 'And then more.',
      meta: {
        actions: ['a', 'b', 'c', 'd'],
        achievement: { title: 'Too Soon', description: 'Should not stick.' },
        summary: 's2',
      },
      metaMissing: false,
    });
    const afterTwo = getStory(promptStory.id)!;
    results.push(
      check(
        'apply: rejects an achievement awarded too soon',
        afterTwo.achievements.length === 1,
        `${afterTwo.achievements.length} achievement(s)`,
      ),
    );

    // A stream that died before the delimiter still keeps its prose.
    applyChapter(afterTwo, { prose: 'Truncated chapter.', meta: null, metaMissing: true });
    const afterThree = getStory(promptStory.id)!;
    const lastChapter = afterThree.chapters.at(-1);
    results.push(
      check(
        'apply: truncated stream keeps prose and flags repair',
        lastChapter?.kind === 'prose' &&
          lastChapter.metaMissing === true &&
          afterThree.pendingActions.length === 0,
      ),
    );

    removeStory(promptStory.id);

    // --- AI: the choice loop and the ending ------------------------------------
    const loopStory = createStory({ audience: 'Children', genre: 'Drama', setting: 'Urban' });

    applyChapter(loopStory, {
      prose: 'Chapter one.',
      meta: { title: 'A Book', actions: ['w', 'x', 'y', 'z'], achievement: null, summary: 's1' },
      metaMissing: false,
    });
    applyChapter(getStory(loopStory.id)!, {
      prose: 'Chapter two.',
      meta: { actions: ['w', 'x', 'y', 'z'], achievement: null, summary: 's2' },
      metaMissing: false,
      chosenAction: 'Open the gate.',
    });
    const looped = getStory(loopStory.id)!;
    const secondChapter = looped.chapters[1];
    results.push(
      check(
        'loop: the chosen action is recorded on the chapter it produced',
        secondChapter?.kind === 'prose' && secondChapter.chosenAction === 'Open the gate.',
      ),
    );
    results.push(
      check(
        'loop: chapter one carries no chosen action',
        looped.chapters[0].kind === 'prose' && looped.chapters[0].chosenAction === undefined,
      ),
    );

    // Fast-forward to the last chapter of a 10-chapter book.
    updateStory(loopStory.id, (cur) => ({
      chapters: Array.from({ length: 9 }, (_, i) => ({
        kind: 'prose' as const,
        index: i,
        text: `Chapter ${i + 1}.`,
      })),
      pendingActions: ['a', 'b', 'c', 'd'],
      status: 'reading' as const,
      totalChapters: cur.totalChapters,
    }));

    applyChapter(getStory(loopStory.id)!, {
      prose: 'And so it ended.',
      // Even if the model offers choices, the final chapter must not carry any.
      meta: { actions: ['a', 'b', 'c', 'd'], achievement: null, summary: 'done' },
      metaMissing: false,
      chosenAction: 'Walk into the light.',
    });
    const finished = getStory(loopStory.id)!;
    results.push(
      check(
        'ending: final chapter finishes the story and clears the choices',
        finished.status === 'finished' && finished.pendingActions.length === 0,
        `status=${finished.status}, actions=${finished.pendingActions.length}`,
      ),
    );

    const finishedPages = buildPages(finished, finished.chapters.map(() => 1));
    results.push(
      check(
        'ending: a finished book gains a closing page',
        finishedPages.at(-1)?.kind === 'end',
      ),
    );
    results.push(
      check(
        'ending: an unfinished book has no closing page',
        !buildPages(looped, looped.chapters.map(() => 1)).some((p) => p.kind === 'end'),
      ),
    );

    removeStory(loopStory.id);

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
