import { StorageFullError } from '../storage/quota';
import { newId, updateStory } from '../storage/stories';
import { chapterCount, type Achievement, type Story } from '../types';
import { displayableProse, MetaFormatError, parseMeta, splitOnDelimiter, type ChapterMeta } from './parse';
import {
  buildContext,
  buildRepairPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  MIN_CHAPTERS_BETWEEN_ACHIEVEMENTS,
  type ChapterContext,
} from './prompts';
import { ApiError, streamCompletion } from './stream';

export interface GenerationResult {
  prose: string;
  meta: ChapterMeta | null;
  /** True when the stream ended before the metadata block arrived. */
  metaMissing: boolean;
  /** The choice that led into this chapter. Absent on chapter one. */
  chosenAction?: string;
}

export async function generateChapter(opts: {
  story: Story;
  apiKey: string;
  chosenAction?: string;
  signal: AbortSignal;
  onProse: (prose: string) => void;
}): Promise<GenerationResult> {
  const { story, apiKey, chosenAction, signal, onProse } = opts;
  const ctx = buildContext(story);

  const raw = await streamCompletion({
    apiKey,
    signal,
    messages: [
      { role: 'system', content: buildSystemPrompt(story, ctx) },
      { role: 'user', content: buildUserPrompt(story, ctx, chosenAction) },
    ],
    onText: (accumulated) => onProse(displayableProse(accumulated)),
  });

  const { prose, metaRaw } = splitOnDelimiter(raw);
  const trimmedProse = prose.trim();

  if (!trimmedProse) {
    throw new ApiError('The model returned no prose. Try again.');
  }

  if (metaRaw === null) {
    // Keep the chapter. Only the choices and summary are lost, and those can be
    // re-requested; the prose cannot.
    return { prose: trimmedProse, meta: null, metaMissing: true, chosenAction };
  }

  try {
    const meta = parseMeta(metaRaw, { title: ctx.needsTitle, actions: !ctx.isFinal });
    return { prose: trimmedProse, meta, metaMissing: false, chosenAction };
  } catch (err) {
    if (err instanceof MetaFormatError) {
      // Unusable metadata is the same situation as metadata that never arrived: the
      // prose is good and must be kept. Throwing here would discard a whole chapter
      // the reader already watched appear, which is the failure the delimited format
      // exists to prevent.
      console.warn('[ai] metadata rejected, keeping the chapter:', err.message);
      return { prose: trimmedProse, meta: null, metaMissing: true, chosenAction };
    }
    throw err;
  }
}

/**
 * Recovers the metadata for a chapter whose prose arrived but whose stream ended
 * before the delimiter. Re-sends the prose and asks only for the JSON block, so the
 * reader keeps the text they already have instead of paying for a rewrite.
 */
export async function repairMeta(opts: {
  story: Story;
  apiKey: string;
  signal: AbortSignal;
}): Promise<ChapterMeta> {
  const { story, apiKey, signal } = opts;
  const last = [...story.chapters].reverse().find((c) => c.kind === 'prose');
  if (!last || last.kind !== 'prose') throw new ApiError('There is no chapter to repair.');

  const ctx = buildContext(story, true);
  const raw = await streamCompletion({
    apiKey,
    signal,
    messages: [
      { role: 'system', content: buildSystemPrompt(story, ctx) },
      { role: 'user', content: buildRepairPrompt(ctx, last.text) },
    ],
    onText: () => {},
  });

  const { metaRaw } = splitOnDelimiter(raw);
  // The model may skip the delimiter when asked for the block alone.
  return parseMeta(metaRaw ?? raw, { title: ctx.needsTitle, actions: !ctx.isFinal });
}

/** Writes recovered metadata onto the chapter that was missing it. */
export function applyRepairedMeta(story: Story, meta: ChapterMeta): Story | undefined {
  const ctx = buildContext(story, true);
  const achievement = acceptAchievement(story, meta, {
    ...ctx,
    // The chapter is already committed, so pacing counts from the previous one.
    chaptersSinceLastAchievement: ctx.chaptersSinceLastAchievement,
  });

  return updateStory(story.id, (current) => {
    const chapters = current.chapters.map((c) =>
      c.kind === 'prose' && c.metaMissing ? { ...c, metaMissing: undefined } : c,
    );
    if (achievement) {
      chapters.push({
        kind: 'achievement' as const,
        index: chapters.length,
        achievementId: achievement.id,
      });
    }
    return {
      chapters,
      achievements: achievement ? [...current.achievements, achievement] : current.achievements,
      pendingActions: meta.actions,
      summary: meta.summary,
      ...(meta.title && !current.title ? { title: meta.title } : {}),
      status: ctx.isFinal ? ('finished' as const) : ('reading' as const),
    };
  });
}

/**
 * Commits a finished generation to the story. Pure bookkeeping — kept apart from the
 * network call so it can be exercised without one.
 */
export function applyChapter(story: Story, result: GenerationResult): Story | undefined {
  const ctx = buildContext(story);
  const index = story.chapters.length;

  const achievement = acceptAchievement(story, result.meta, ctx);

  return updateStory(story.id, (current) => {
    const chapters = [
      ...current.chapters,
      {
        kind: 'prose' as const,
        index,
        text: result.prose,
        ...(result.chosenAction ? { chosenAction: result.chosenAction } : {}),
        ...(result.metaMissing ? { metaMissing: true } : {}),
      },
    ];

    if (achievement) {
      chapters.push({
        kind: 'achievement' as const,
        index: chapters.length,
        achievementId: achievement.id,
      });
    }

    return {
      chapters,
      achievements: achievement ? [...current.achievements, achievement] : current.achievements,
      // The final chapter offers no choices, whatever the model returned. The parser
      // already drops them, but the ending invariant should not depend on that.
      pendingActions: ctx.isFinal ? [] : (result.meta?.actions ?? []),
      summary: result.meta?.summary ?? current.summary,
      ...(result.meta?.title && !current.title ? { title: result.meta.title } : {}),
      // A chapter with no metadata leaves the story without choices, so it stays
      // 'reading' and the UI offers a retry rather than pretending it is finished.
      status: ctx.isFinal && !result.metaMissing ? ('finished' as const) : ('reading' as const),
      // The bridge has been written; clear the marker so it is not applied twice.
      genreChangedAtChapter: undefined,
    };
  });
}

/**
 * The model decides whether a chapter earned an achievement, per the product design.
 * This only rejects runaway pacing — the guard the spec calls cheap insurance.
 */
function acceptAchievement(
  story: Story,
  meta: ChapterMeta | null,
  ctx: ChapterContext,
): Achievement | null {
  if (!meta?.achievement) return null;

  // Only meaningful once something has been awarded; the first one has nothing to
  // be too close to.
  if (
    ctx.chaptersSinceLastAchievement !== null &&
    ctx.chaptersSinceLastAchievement < MIN_CHAPTERS_BETWEEN_ACHIEVEMENTS
  ) {
    console.info(
      `[ai] dropped achievement "${meta.achievement.title}" — only ${ctx.chaptersSinceLastAchievement} chapter(s) since the last one`,
    );
    return null;
  }

  // Never award the same milestone twice, however it is phrased.
  const seen = story.achievements.some(
    (a) => a.title.toLowerCase() === meta.achievement!.title.toLowerCase(),
  );
  if (seen) return null;

  return {
    id: newId(),
    title: meta.achievement.title,
    description: meta.achievement.description,
    unlockedAtChapter: chapterCount(story) + 1,
  };
}

/** Turns any thrown value into something worth showing a reader. */
export function describeGenerationError(err: unknown): string {
  // A chapter that cannot be saved is not a network problem, and telling the reader to
  // "try again" would loop them straight back into the same full disk.
  if (err instanceof StorageFullError) return err.message;
  // Only reachable from a repair attempt now; a first pass keeps the prose instead.
  if (err instanceof MetaFormatError) {
    return `${err.message} Try again.`;
  }
  if (err instanceof ApiError) return err.message;
  if (err instanceof DOMException && err.name === 'AbortError') return 'Generation cancelled.';
  return 'Something went wrong while writing. Try again.';
}
