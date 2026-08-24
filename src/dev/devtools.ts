import { normalizeCover, putCover } from '../storage/covers.idb';
import { getSnapshot, getStory, replaceAll, updateStory } from '../storage/stories';
import { saveSettings, loadSettings } from '../storage/settings';
import { FIXTURE_STORIES } from './fixtures';
import { reconcileOnce, retryCoverNow } from '../ai/coverReconciler';
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

/** How the mocked image endpoint should behave, independently of the text endpoint. */
export type ImageMockMode = 'ok' | 'fail' | 'refuse';
let imageMode: ImageMockMode = 'ok';
let imageCalls: Array<{ prompt: string; tier: string }> = [];

export function mockImages(mode: ImageMockMode): void {
  imageMode = mode;
  console.info(`[dev] image endpoint mocked in "${mode}" mode`);
}

export function imageCallLog(): Array<{ prompt: string; tier: string }> {
  return imageCalls;
}

export function clearImageCallLog(): void {
  imageCalls = [];
}

/** A tiny PNG, base64 — enough to exercise decode, downscale and IndexedDB storage. */
async function mockImageBase64(): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 512, 768);
  g.addColorStop(0, '#7b3fa0');
  g.addColorStop(1, '#1b1030');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 768);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.arc(340, 240, 90, 0, Math.PI * 2);
  ctx.fill();
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of buf) binary += String.fromCharCode(byte);
  return btoa(binary);
}

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

    if (url.includes('/models/gpt-image-1')) {
      // 'refuse' stands in for the organization-verification 403 here, since that is
      // the failure this probe exists to catch.
      if (imageMode === 'refuse') {
        return new Response(
          JSON.stringify({
            error: { message: 'Your organization must be verified to use the model `gpt-image-1`.' },
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ id: 'gpt-image-1', object: 'model' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/images/generations')) {
      const sent = JSON.parse(String(init?.body ?? '{}')) as { prompt?: string };
      imageCalls.push({
        prompt: sent.prompt ?? '',
        // Which prompt tier this was, inferred from the shape the builder produces.
        tier: sent.prompt?.includes('minimal typographic')
          ? '2'
          : sent.prompt?.includes('Simple graphic design')
            ? '1'
            : '0',
      });

      if (imageMode === 'refuse') {
        return new Response(
          JSON.stringify({ error: { code: 'moderation_blocked', message: 'safety system' } }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (imageMode === 'fail') {
        return new Response(JSON.stringify({ error: { message: 'mock image outage' } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ data: [{ b64_json: await mockImageBase64() }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!url.includes('/chat/completions')) return realFetch!(input, init);

    if (mode === 'network') throw new TypeError('Failed to fetch');

    // The title call is a plain, non-streaming completion.
    const requested = JSON.parse(String(init?.body ?? '{}')) as { stream?: boolean };
    if (!requested.stream) {
      if (mode === 'http401' || mode === 'http429') {
        return new Response(JSON.stringify({ error: { message: 'mock failure' } }), {
          status: mode === 'http401' ? 401 : 429,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '"The Ninth Door."' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

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
    mockImages,
    imageCallLog,
    clearImageCallLog,
    reconcileOnce,
    retryCoverNow,
    // Store accessors: tests must go through the store, since writing localStorage
    // directly bypasses its in-memory cache and silently diverges.
    updateStory,
    getStory,
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
      mockImages: typeof mockImages;
      imageCallLog: typeof imageCallLog;
      clearImageCallLog: typeof clearImageCallLog;
      reconcileOnce: typeof reconcileOnce;
      retryCoverNow: typeof retryCoverNow;
      updateStory: typeof updateStory;
      getStory: typeof getStory;
    };
  }
}
