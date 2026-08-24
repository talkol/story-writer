/** Core domain types. See SPEC.md §3. */

export const AUDIENCES = ['Children', 'Young Adults', 'Adults'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Crime',
  'Drama',
  'Horror',
  'Mystery',
  'Romance',
  'Fairy Tale',
] as const;
export type Genre = (typeof GENRES)[number];

export const SETTINGS = [
  'Western',
  'Space',
  'Fantasy',
  'Urban',
  'Nature',
  'Mythological',
  'Futuristic',
  'Medieval',
  'Prehistoric',
  'Historic',
] as const;
export type Setting = (typeof SETTINGS)[number];

/**
 * Audience drives both how long the book is and how much text arrives per part.
 * Fixed at creation; editing audience mid-story does not restructure the arc.
 */
export const AUDIENCE_PROFILE: Record<
  Audience,
  { totalChapters: number; wordsPerChapter: number; label: string }
> = {
  Children: { totalChapters: 10, wordsPerChapter: 250, label: 'a short book, 10 chapters' },
  'Young Adults': { totalChapters: 20, wordsPerChapter: 500, label: 'a full book, 20 chapters' },
  Adults: { totalChapters: 30, wordsPerChapter: 800, label: 'a long book, 30 chapters' },
};

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlockedAtChapter: number;
}

export type Chapter =
  | {
      kind: 'prose';
      index: number;
      text: string;
      /** The action the reader chose that led into this chapter. Absent on chapter 1. */
      chosenAction?: string;
      /** True when the stream ended before the metadata block arrived. */
      metaMissing?: boolean;
    }
  | { kind: 'achievement'; index: number; achievementId: string };

export type StoryStatus = 'draft' | 'reading' | 'finished';

/** Resume anchor. A page number would break on rotate or font change. */
export interface ReadingPosition {
  chapterIndex: number;
  wordOffset: number;
}

/**
 * Cover generation is a persisted job, not a fire-and-forget call. Recording the
 * *intent* is what lets a failed cover heal later: a blob that never arrived leaves no
 * trace, whereas a pending job can be retried on the next app launch, days later.
 *
 * The field is optional. A titled story with no cover and no job is treated as an
 * implicitly pending job, which is how stories created before covers existed get
 * picked up.
 */
export interface CoverJob {
  attempts: number;
  /** Epoch ms. Retries back off to a 12-hour ceiling and then continue at that rate. */
  nextAttemptAt: number;
  lastError?: string;
  /** Prompt tier reached; raised when the model refuses the prompt outright. */
  tier?: number;
  /** Epoch ms lease, so two open tabs do not generate the same cover twice. */
  leaseUntil?: number;
}

export interface Story {
  id: string;
  title: string;
  coverImageId: string | null;
  coverJob?: CoverJob;
  audience: Audience;
  genre: Genre;
  setting: Setting;
  totalChapters: number;
  chapters: Chapter[];
  achievements: Achievement[];
  /** The 4 choices awaiting the reader. Empty when generating or finished. */
  pendingActions: string[];
  /** Rolling plot summary, ~500 words, rewritten by the model each chapter. */
  summary: string;
  status: StoryStatus;
  readingPosition: ReadingPosition;
  /** Set when the genre triple changed mid-story, so the next prompt can bridge it. */
  genreChangedAtChapter?: number;
  createdAt: number;
  updatedAt: number;
}

export const FONT_SCALES = [0.85, 1, 1.15, 1.3] as const;
export type FontScale = (typeof FONT_SCALES)[number];

export interface Settings {
  apiKey: string | null;
  fontScale: FontScale;
}

/** Number of prose chapters written so far, ignoring achievement pages. */
export function chapterCount(story: Story): number {
  return story.chapters.filter((c) => c.kind === 'prose').length;
}

export function isFinalChapter(story: Story, chapterNumber: number): boolean {
  return chapterNumber >= story.totalChapters;
}
