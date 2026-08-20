import { normalizeCover, putCover } from '../storage/covers.idb';
import { getSnapshot, replaceAll, updateStory } from '../storage/stories';
import { saveSettings, loadSettings } from '../storage/settings';
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

/**
 * Serves a canned OpenAI SSE stream in place of the network, so the whole generation
 * path — streaming, delimiter handling, validation, commit, and the reader UI — can be
 * exercised without a real key or a real charge.
 *
 * `mode` picks which failure to rehearse. Call `stopMock()` to restore fetch.
 */
export type MockMode = 'ok' | 'truncated' | 'badjson' | 'http401' | 'http429' | 'network';

let realFetch: typeof fetch | null = null;

export function mockOpenAI(mode: MockMode = 'ok', chunkDelayMs = 20): void {
  if (!realFetch) realFetch = window.fetch.bind(window);

  const prose = [
    'The lift doors opened onto a corridor that should not have existed.',
    'Tomas counted the doors twice. There were nine. The building had eight floors.',
    'He stepped out anyway, because that is the kind of person he had decided to be.',
  ].join('\n\n');

  const meta = {
    title: 'The Ninth Door',
    actions: [
      'Open the ninth door.',
      'Go back down and tell the caretaker.',
      'Count the doors a third time.',
      'Wait in the corridor until someone comes.',
    ],
    achievement: { title: 'Ninth Door', description: 'You found a floor that was not there.' },
    summary: 'Tomas finds an impossible ninth floor in his own building and steps out.',
  };

  const body =
    mode === 'truncated'
      ? prose
      : mode === 'badjson'
        ? prose + '\n\n===META===\n{ this is not json'
        : prose + '\n\n===META===\n' + JSON.stringify(meta);

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.includes('/chat/completions')) return realFetch!(input, init);

    if (mode === 'network') throw new TypeError('Failed to fetch');
    if (mode === 'http401' || mode === 'http429') {
      const status = mode === 'http401' ? 401 : 429;
      return new Response(JSON.stringify({ error: { message: 'mock quota exceeded' } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Emit the body as SSE frames, honouring abort.
    //
    // With chunkDelayMs = 0 no timers are used at all. That matters for automated
    // checks: a tab that has been hidden for a while gets *intensive* timer
    // throttling (roughly once a minute), which turns a per-chunk delay into a stall.
    const words = body.split(/(\s+)/);
    const perFrame = chunkDelayMs === 0 ? Math.ceil(words.length / 4) : 6;
    const signal = init?.signal ?? undefined;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        // Real fetch rejects an in-flight read the moment the signal aborts. Checking
        // only between chunks would make Cancel appear broken whenever a chunk delay
        // is in play.
        let aborted = false;
        signal?.addEventListener('abort', () => {
          aborted = true;
          try {
            controller.error(new DOMException('Aborted', 'AbortError'));
          } catch {
            /* already closed */
          }
        });
        for (let i = 0; i < words.length; i += perFrame) {
          if (aborted || signal?.aborted) return;
          const piece = words.slice(i, i + perFrame).join('');
          const frame = { choices: [{ delta: { content: piece } }] };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
          if (chunkDelayMs > 0) await new Promise((r) => setTimeout(r, chunkDelayMs));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }) as typeof fetch;

  // The client refuses to run without a key; supply a fake one for the mock.
  if (!loadSettings().apiKey) saveSettings({ ...loadSettings(), apiKey: 'sk-mock-key' });
  console.info(`[dev] OpenAI mocked in "${mode}" mode — call __dev.stopMock() to restore`);
}

export function stopMock(): void {
  if (realFetch) window.fetch = realFetch;
  realFetch = null;
  console.info('[dev] real fetch restored');
}

export function install(): void {
  seedIfEmpty();
  window.__dev = {
    seedFixtures,
    clearStories: () => replaceAll([]),
    selftest,
    mockOpenAI,
    stopMock,
  };
  console.info('[dev] window.__dev ready — try __dev.selftest()');
}

declare global {
  interface Window {
    __dev: {
      seedFixtures: () => Promise<void>;
      clearStories: () => void;
      selftest: typeof selftest;
      mockOpenAI: typeof mockOpenAI;
      stopMock: typeof stopMock;
    };
  }
}
