import { checkImageAccess, generateCover, PromptRefusedError } from './cover';
import { generateTitle } from './title';
import { ApiError } from './stream';
import { deleteCover, normalizeCover, putCover } from '../storage/covers.idb';
import { loadSettings } from '../storage/settings';
import { getSnapshot, newId, subscribe, updateStory } from '../storage/stories';
import type { CoverJob, Story } from '../types';

/**
 * Keeps every titled story supplied with a cover, healing failures over time.
 *
 * A module-level singleton rather than a React effect, on purpose: it must outlive
 * component mounts. A reconciler tied to a screen would have its in-flight request
 * aborted every time the user navigated — and, in development, by StrictMode's
 * remount. It also means the loop keeps running while the reader is elsewhere.
 */

/** Backoff ladder. Retries continue indefinitely at the final rate. */
const BACKOFF_MS = [
  60_000, //   1 minute
  300_000, //  5 minutes
  1_800_000, // 30 minutes
  7_200_000, //  2 hours
  43_200_000, // 12 hours — the ceiling, repeated from here on
];

const TICK_MS = 60_000;
const LEASE_MS = 180_000;

/**
 * Minimum gap between two cover generations. The reconciler re-runs whenever the store
 * changes, and finishing a job changes the store — so without this, a library of
 * twenty cover-less stories would fire twenty image requests back to back the moment
 * the app opened. Serial execution alone does not pace it.
 */
const MIN_GAP_MS = 4_000;

let started = false;
let timer: number | null = null;
/**
 * The run in flight, if any. Held as a promise rather than a boolean so a caller can
 * await work that is already underway: the store notifies subscribers synchronously,
 * so any `updateStory` immediately kicks off a tick, and a caller that then awaited
 * its own `tick()` would otherwise hit the busy guard and return before the real
 * attempt had finished — reading state that has not been written yet.
 */
let running: Promise<void> | null = null;
let nextRunAfter = 0;

export function startCoverReconciler(): void {
  if (started) return;
  started = true;

  const kick = () => void tick();

  timer = window.setInterval(kick, TICK_MS);
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) kick();
  });
  // Re-run whenever the library changes: a chapter committing gives a story its title,
  // which is the moment its cover becomes generatable.
  subscribe(kick);

  // Available in production too: cover failures are invisible by nature, and the dev
  // tooling is stripped from release builds.
  window.coverDiagnostics = () => {
    const rows = getSnapshot().map((s) => ({
      title: s.title || '(untitled)',
      hasCover: !!s.coverImageId,
      chapters: s.chapters.length,
      attempts: s.coverJob?.attempts ?? 0,
      retryInSec: s.coverJob ? Math.round((s.coverJob.nextAttemptAt - Date.now()) / 1000) : 0,
      lastError: s.coverJob?.lastError ?? '',
    }));
    const info = {
      hasApiKey: !!loadSettings().apiKey,
      online: navigator.onLine,
      blocker: coverBlocker(),
      reconcilerRunning: running !== null,
      pacedUntilSec: Math.max(0, Math.round((nextRunAfter - Date.now()) / 1000)),
      stories: rows,
    };
    console.table(rows);
    console.log(info);
    return info;
  };

  kick();
}

declare global {
  interface Window {
    coverDiagnostics: () => unknown;
  }
}

/** Test seam. */
export function stopCoverReconciler(): void {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  started = false;
  running = null;
}

/**
 * Throws away a story's cover and draws a new one.
 *
 * Also handles the case where there is no cover yet, so one menu item serves both
 * "retry the one that failed" and "I don't like this one". Resets the prompt tier as
 * well as the backoff: a fresh request should start from the best prompt, not from
 * wherever a previous run's refusals left it.
 */
export function regenerateCover(storyId: string): void {
  const previous = getSnapshot().find((s) => s.id === storyId)?.coverImageId;

  // Clear the pacing gap *before* touching the store. `updateStory` notifies
  // subscribers synchronously, so it kicks a tick immediately — and that tick would
  // bounce off the gap and do nothing, leaving the story cleared but not redrawn.
  nextRunAfter = 0;

  updateStory(storyId, {
    coverImageId: null,
    coverJob: { attempts: 0, tier: 0, nextAttemptAt: 0, leaseUntil: 0 },
  });

  // The record no longer points at it, so a failed delete is a leak, not a breakage.
  if (previous) {
    void deleteCover(previous).catch((err) =>
      console.warn('[covers] could not delete the replaced cover', err),
    );
  }

  void tick();
}

/** Clears the backoff on one story so the next tick picks it up — the manual retry. */
export function retryCoverNow(storyId: string): void {
  // Pacing exists to stop the background loop bursting; a deliberate tap is not that,
  // and deferring it by several seconds reads as a dead button. Cleared first, for the
  // same synchronous-notification reason as in regenerateCover.
  nextRunAfter = 0;
  updateStory(storyId, (s) => ({
    coverJob: { ...(s.coverJob ?? { attempts: 0, tier: 0 }), nextAttemptAt: 0, leaseUntil: 0 },
  }));
  void tick();
}

/**
 * A saved key can turn every "failed" story into a retryable one, so drop all backoffs
 * rather than making the user wait out a 12-hour timer they already fixed.
 */
export function resetCoverBackoffs(): void {
  nextRunAfter = 0;
  for (const story of getSnapshot()) {
    // No title check: the reconciler names untitled stories itself.
    if (story.coverImageId) continue;
    updateStory(story.id, (s) => ({
      coverJob: { ...(s.coverJob ?? { attempts: 0, tier: 0 }), nextAttemptAt: 0, leaseUntil: 0 },
    }));
  }
  void tick();
}

export function coverJobOf(story: Story): CoverJob {
  return story.coverJob ?? { attempts: 0, nextAttemptAt: 0, tier: 0 };
}

/**
 * Whether a story is waiting on a cover: any story without one.
 *
 * Not gated on having a title. The image model letters the title onto the artwork, so
 * a title is required — but the reconciler generates one itself when it is missing,
 * rather than waiting on chapter one. A story whose first chapter never generated
 * would otherwise sit untitled and coverless forever.
 *
 * No job record is required either — that is how stories created before covers existed
 * get healed.
 */
export function isCoverPending(story: Story): boolean {
  return !story.coverImageId;
}

/** Why the reconciler cannot currently do any work, if anything. */
export type CoverBlocker = 'no-key' | 'offline' | null;

export function coverBlocker(): CoverBlocker {
  if (!loadSettings().apiKey) return 'no-key';
  if (!navigator.onLine) return 'offline';
  return null;
}

/**
 * True only when a cover is genuinely on its way. The pending shimmer must not run
 * when nothing can happen — an animation that implies progress while the reconciler is
 * blocked on a missing key is worse than no indicator at all.
 */
export function isCoverGenerating(story: Story): boolean {
  return isCoverPending(story) && coverBlocker() === null;
}

/** Summary for the Settings screen, so a stalled cover is discoverable. */
export function coverStatus(): {
  pending: number;
  blocker: CoverBlocker;
  lastError?: string;
  nextInSec?: number;
} {
  const waiting = getSnapshot().filter(isCoverPending);
  const withError = waiting.find((s) => s.coverJob?.lastError);
  const soonest = waiting
    .map((s) => coverJobOf(s).nextAttemptAt)
    .sort((a, b) => a - b)[0];

  return {
    pending: waiting.length,
    blocker: coverBlocker(),
    lastError: withError?.coverJob?.lastError,
    nextInSec:
      soonest && soonest > Date.now() ? Math.round((soonest - Date.now()) / 1000) : 0,
  };
}

function eligible(story: Story, now: number): boolean {
  if (!isCoverPending(story)) return false;
  const job = coverJobOf(story);
  if ((job.leaseUntil ?? 0) > now) return false; // another tab is on it
  return job.nextAttemptAt <= now;
}

export function backoffFor(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
}

function tick(): Promise<void> {
  if (running) return running;
  const run = runOnce();
  running = run;
  void run.finally(() => {
    running = null;
    nextRunAfter = Date.now() + MIN_GAP_MS;
  });
  return run;
}

async function runOnce(): Promise<void> {
  const apiKey = loadSettings().apiKey;
  if (!apiKey || !navigator.onLine) return;

  const now = Date.now();
  if (now < nextRunAfter) return;
  const story = getSnapshot().find((s) => eligible(s, now));
  if (!story) return;

  await attemptCover(story, apiKey);
}

/**
 * One cover attempt for one story, start to finish, returning what happened.
 *
 * Deliberately separate from the scheduler so a user-initiated diagnosis can invoke it
 * directly. Routing that through `tick()` cannot work: the store notifies subscribers
 * synchronously, so clearing a backoff fires a tick from inside `updateStory`, and the
 * caller then awaits that already-settled no-op rather than the attempt it asked for.
 */
async function attemptCover(
  story: Story,
  apiKey: string,
): Promise<{ ok: boolean; message: string }> {
  const now = Date.now();
  const job = coverJobOf(story);

  try {
    // Inside the try: a throw here (a full disk, say) would otherwise leave the job
    // leased and silently stall this story.
    updateStory(story.id, { coverJob: { ...job, leaseUntil: now + LEASE_MS } });

    // The cover has the title printed on it, so name the book first if nothing has.
    // Stored immediately, so a failed cover never pays to name the book twice.
    let titled = story;
    if (!titled.title.trim()) {
      const title = await generateTitle({
        story: titled,
        apiKey,
        signal: AbortSignal.timeout(60_000),
      });
      titled = updateStory(story.id, { title }) ?? { ...titled, title };
      console.info(`[covers] named story "${title}"`);
    }

    const raw = await generateCover({
      story: titled,
      apiKey,
      tier: job.tier ?? 0,
      signal: AbortSignal.timeout(120_000),
    });
    const coverId = newId();
    await putCover(coverId, await normalizeCover(raw));
    updateStory(story.id, { coverImageId: coverId, coverJob: undefined });
    console.info(`[covers] generated cover for "${titled.title}"`);
    return { ok: true, message: `Cover generated for "${titled.title || 'your story'}".` };
  } catch (err) {
    const attempts = job.attempts + 1;
    // A refusal is a problem with the prompt, so escalate to a plainer one straight
    // away rather than re-sending something the model has already declined.
    const tier = err instanceof PromptRefusedError ? (job.tier ?? 0) + 1 : (job.tier ?? 0);
    const wait = backoffFor(attempts - 1);

    const message =
      err instanceof ApiError || err instanceof PromptRefusedError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Cover generation failed.';

    updateStory(story.id, {
      coverJob: { attempts, tier, nextAttemptAt: Date.now() + wait, lastError: message, leaseUntil: 0 },
    });
    console.warn(
      `[covers] attempt ${attempts} failed for "${story.title}" — retrying in ${Math.round(wait / 1000)}s`,
      err,
    );
    return { ok: false, message };
  }
}

/**
 * One definitive diagnosis of why covers are not appearing.
 *
 * Checks model access first, which is free and catches the organization-verification
 * 403. Only if that passes does it force a real attempt — and that attempt is a real
 * cover for a real story, so a successful probe is not wasted spend.
 */
export async function probeCovers(): Promise<{ ok: boolean; message: string }> {
  const apiKey = loadSettings().apiKey;
  if (!apiKey) return { ok: false, message: 'No API key saved. Add one above.' };
  if (!navigator.onLine) return { ok: false, message: 'No network connection.' };

  const access = await checkImageAccess(apiKey);
  if (!access.ok) return access;

  const waiting = getSnapshot().find(isCoverPending);
  if (!waiting) return { ok: true, message: 'Image access works, and no covers are missing.' };

  // Run the attempt directly rather than through the scheduler, so the result reported
  // is this attempt's and not whatever the background loop happened to be doing.
  return attemptCover(waiting, apiKey);
}

/** Test seam: run one reconciliation pass immediately, ignoring the pacing gap. */
export function reconcileOnce(): Promise<void> {
  nextRunAfter = 0;
  return tick();
}
