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
  { totalParts: number; wordsPerPart: number; label: string }
> = {
  Children: { totalParts: 10, wordsPerPart: 250, label: 'a short book, 10 chapters' },
  'Young Adults': { totalParts: 20, wordsPerPart: 500, label: 'a full book, 20 chapters' },
  Adults: { totalParts: 30, wordsPerPart: 800, label: 'a long book, 30 chapters' },
};

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlockedAtPart: number;
}

export type Part =
  | {
      kind: 'prose';
      index: number;
      text: string;
      /** The action the reader chose that led into this part. Absent on part 1. */
      chosenAction?: string;
      /** True when the stream ended before the metadata block arrived. */
      metaMissing?: boolean;
    }
  | { kind: 'achievement'; index: number; achievementId: string };

export type StoryStatus = 'draft' | 'reading' | 'finished';

/** Resume anchor. A page number would break on rotate or font change. */
export interface ReadingPosition {
  partIndex: number;
  wordOffset: number;
}

export interface Story {
  id: string;
  title: string;
  coverImageId: string | null;
  audience: Audience;
  genre: Genre;
  setting: Setting;
  totalParts: number;
  parts: Part[];
  achievements: Achievement[];
  /** The 4 choices awaiting the reader. Empty when generating or finished. */
  pendingActions: string[];
  /** Rolling plot summary, ~200 words, rewritten by the model each part. */
  summary: string;
  status: StoryStatus;
  readingPosition: ReadingPosition;
  /** Set when the genre triple changed mid-story, so the next prompt can bridge it. */
  genreChangedAtPart?: number;
  createdAt: number;
  updatedAt: number;
}

export const FONT_SCALES = [0.85, 1, 1.15, 1.3] as const;
export type FontScale = (typeof FONT_SCALES)[number];

export interface Settings {
  apiKey: string | null;
  fontScale: FontScale;
}

/** Number of prose parts written so far, ignoring achievement pages. */
export function proseCount(story: Story): number {
  return story.parts.filter((p) => p.kind === 'prose').length;
}

export function isFinalPart(story: Story, partNumber: number): boolean {
  return partNumber >= story.totalParts;
}
