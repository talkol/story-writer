import type { Story } from '../types';

/**
 * A page is derived, never stored. Prose pages are slices of a chapter's flow;
 * achievement pages are whole chapters that occupy exactly one page.
 */
export type PageRef =
  | { kind: 'prose'; chapterIndex: number; sliceIndex: number }
  | { kind: 'achievement'; chapterIndex: number; achievementId: string };

/**
 * Flattens the story into a page list. Chapters always start on a new page, which is
 * what a book does and what makes the resume anchor (chapter + word) unambiguous.
 */
export function buildPages(story: Story, slicesPerChapter: number[]): PageRef[] {
  const pages: PageRef[] = [];

  story.chapters.forEach((chapter, chapterIndex) => {
    if (chapter.kind === 'achievement') {
      pages.push({ kind: 'achievement', chapterIndex, achievementId: chapter.achievementId });
      return;
    }
    const slices = Math.max(1, slicesPerChapter[chapterIndex] ?? 1);
    for (let sliceIndex = 0; sliceIndex < slices; sliceIndex++) {
      pages.push({ kind: 'prose', chapterIndex, sliceIndex });
    }
  });

  return pages;
}

export function firstPageOfChapter(pages: PageRef[], chapterIndex: number): number {
  const found = pages.findIndex((p) => p.chapterIndex === chapterIndex);
  return found === -1 ? 0 : found;
}

/** Splits chapter prose into paragraphs, dropping blank runs. */
export function toParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
