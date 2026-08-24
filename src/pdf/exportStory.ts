import { embedBookFont, PDF_FONT } from './fonts';
import { getCover } from '../storage/covers.idb';
import { toParagraphs } from '../reader/pages';
import type { Achievement, Story } from '../types';

/**
 * Renders a story as a PDF book: cover, title page, the prose reflowed to the page
 * size with chapter breaks, achievement inserts in place, and an index at the end.
 *
 * jsPDF is imported dynamically. It is roughly a third of a megabyte, and most sessions
 * never export anything — loading it up front would make every cold start pay for a
 * feature used occasionally.
 */

/**
 * B-format paperback (129×198mm) — the standard size for a printed novel, and notably
 * smaller in the hand than A5.
 */
const PAGE = { w: 129, h: 198 };
const MARGIN = { top: 20, bottom: 18, x: 15 };

/**
 * Literata runs a little larger on the body than Times at the same point size, so the
 * measure lands around 60 characters at this page width — about right for a novel.
 */
const BODY_SIZE = 9.6;
const BODY_LEADING = 5;

/** Swapped for a built-in if the font assets cannot be fetched. */
let bodyFont = PDF_FONT;

export interface ExportProgress {
  (stage: string): void;
}

export async function exportStoryToPdf(story: Story, onProgress?: ExportProgress): Promise<void> {
  const doc = await buildStoryPdf(story, onProgress);
  onProgress?.('Saving…');
  doc.save(`${safeFilename(story.title || 'story')}.pdf`);
}

/**
 * Builds the document without saving it, so the result can be inspected rather than
 * only downloaded.
 */
export async function buildStoryPdf(
  story: Story,
  onProgress?: ExportProgress,
): Promise<import('jspdf').jsPDF> {
  onProgress?.('Preparing…');
  const { jsPDF } = await import('jspdf');

  const doc = new jsPDF({ unit: 'mm', format: [PAGE.w, PAGE.h], compress: true });
  bodyFont = (await embedBookFont(doc)) ? PDF_FONT : 'times';
  const textWidth = PAGE.w - MARGIN.x * 2;

  onProgress?.('Drawing the cover…');
  const drewCover = await addCoverPage(doc, story);

  if (drewCover) doc.addPage();
  addTitlePage(doc, story);

  onProgress?.('Setting the text…');
  // The title page stands alone; without this the first chapter prints on top of it.
  doc.addPage();
  let y = startPage(doc);
  let chapterNumber = 0;

  for (const chapter of story.chapters) {
    if (chapter.kind === 'achievement') {
      const achievement = story.achievements.find((a) => a.id === chapter.achievementId);
      if (achievement) {
        doc.addPage();
        addAchievementInsert(doc, achievement);
        y = startPage(doc);
      }
      continue;
    }

    chapterNumber += 1;
    // Chapters open on a fresh page, as they do in the reader and in a printed book.
    if (chapterNumber > 1) {
      doc.addPage();
      y = startPage(doc);
    }

    doc.setFont(bodyFont, 'bold').setFontSize(14);
    doc.text(`Chapter ${chapterNumber}`, MARGIN.x, y);
    y += BODY_LEADING * 2.6;

    doc.setFont(bodyFont, 'normal').setFontSize(BODY_SIZE);
    for (const paragraph of toParagraphs(chapter.text)) {
      // Emphasis is a reader-side convention; the PDF takes the plain words.
      const lines = doc.splitTextToSize(paragraph.replace(/\*/g, ''), textWidth) as string[];
      for (const line of lines) {
        if (y > PAGE.h - MARGIN.bottom) {
          doc.addPage();
          y = startPage(doc);
        }
        doc.text(line, MARGIN.x, y);
        y += BODY_LEADING;
      }
      y += BODY_LEADING * 0.6;
    }
  }

  if (story.status === 'finished') {
    doc.addPage();
    y = PAGE.h / 2;
    doc.setFont(bodyFont, 'italic').setFontSize(13);
    doc.text('The End', PAGE.w / 2, y, { align: 'center' });
  }

  if (story.achievements.length) {
    onProgress?.('Adding achievements…');
    doc.addPage();
    addAchievementIndex(doc, story);
  }

  addPageNumbers(doc, drewCover);
  return doc;
}

function startPage(doc: import('jspdf').jsPDF): number {
  doc.setFont(bodyFont, 'normal').setFontSize(BODY_SIZE);
  return MARGIN.top;
}

/**
 * Full-bleed cover. The title is not drawn over it: the image model letters the title
 * into the artwork itself, so overlaying it here would print it twice.
 */
async function addCoverPage(doc: import('jspdf').jsPDF, story: Story): Promise<boolean> {
  if (!story.coverImageId) return false;

  const blob = await getCover(story.coverImageId).catch(() => undefined);
  if (!blob) return false;

  const dataUrl = await blobToDataUrl(blob);
  const bitmap = await createImageBitmap(blob);

  // Cover-fit the page, letting the overflowing axis run off the edge.
  const scale = Math.max(PAGE.w / bitmap.width, PAGE.h / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  bitmap.close();

  doc.addImage(dataUrl, 'JPEG', (PAGE.w - w) / 2, (PAGE.h - h) / 2, w, h);
  return true;
}

function addTitlePage(doc: import('jspdf').jsPDF, story: Story): void {
  const centre = PAGE.w / 2;

  doc.setFont(bodyFont, 'bold').setFontSize(18);
  const title = doc.splitTextToSize(story.title || 'Untitled Story', PAGE.w - 34) as string[];
  let y = PAGE.h * 0.38;
  for (const line of title) {
    doc.text(line, centre, y, { align: 'center' });
    y += 8;
  }

  doc.setFont(bodyFont, 'normal').setFontSize(7.5);
  doc.setTextColor(120);
  doc.text(
    `${story.audience.toUpperCase()}  ·  ${story.genre.toUpperCase()}  ·  ${story.setting.toUpperCase()}`,
    centre,
    y + 6,
    { align: 'center' },
  );
  doc.text(
    `${story.chapters.filter((c) => c.kind === 'prose').length} of ${story.totalChapters} chapters`,
    centre,
    y + 12,
    { align: 'center' },
  );
  doc.setTextColor(0);
}

function addAchievementInsert(doc: import('jspdf').jsPDF, achievement: Achievement): void {
  const centre = PAGE.w / 2;
  let y = PAGE.h * 0.42;

  doc.setFont(bodyFont, 'bold').setFontSize(7);
  doc.setTextColor(130);
  doc.text('ACHIEVEMENT UNLOCKED', centre, y, { align: 'center' });

  doc.setTextColor(0);
  doc.setFont(bodyFont, 'bold').setFontSize(15);
  y += 10;
  for (const line of doc.splitTextToSize(achievement.title, PAGE.w - 50) as string[]) {
    doc.text(line, centre, y, { align: 'center' });
    y += 7.5;
  }

  doc.setFont(bodyFont, 'italic').setFontSize(10);
  doc.setTextColor(90);
  y += 3;
  for (const line of doc.splitTextToSize(achievement.description, PAGE.w - 46) as string[]) {
    doc.text(line, centre, y, { align: 'center' });
    y += 6;
  }
  doc.setTextColor(0);
}

function addAchievementIndex(doc: import('jspdf').jsPDF, story: Story): void {
  let y = MARGIN.top;
  doc.setFont(bodyFont, 'bold').setFontSize(14);
  doc.text('Achievements', MARGIN.x, y);
  y += 11;

  for (const achievement of story.achievements) {
    if (y > PAGE.h - MARGIN.bottom - 10) {
      doc.addPage();
      y = MARGIN.top;
    }
    doc.setFont(bodyFont, 'bold').setFontSize(10.5);
    doc.text(achievement.title, MARGIN.x, y);

    doc.setFont(bodyFont, 'normal').setFontSize(7);
    doc.setTextColor(130);
    doc.text(`CHAPTER ${achievement.unlockedAtChapter}`, PAGE.w - MARGIN.x, y, { align: 'right' });

    doc.setTextColor(70);
    doc.setFont(bodyFont, 'italic').setFontSize(9);
    y += 5;
    for (const line of doc.splitTextToSize(
      achievement.description,
      PAGE.w - MARGIN.x * 2,
    ) as string[]) {
      doc.text(line, MARGIN.x, y);
      y += 5;
    }
    doc.setTextColor(0);
    y += 5;
  }
}

/** Numbers every page except the cover, which a printed book also leaves unnumbered. */
function addPageNumbers(doc: import('jspdf').jsPDF, hasCover: boolean): void {
  const total = doc.getNumberOfPages();
  const firstNumbered = hasCover ? 2 : 1;

  for (let page = firstNumbered; page <= total; page++) {
    doc.setPage(page);
    doc.setFont(bodyFont, 'normal').setFontSize(7);
    doc.setTextColor(150);
    doc.text(String(page - firstNumbered + 1), PAGE.w / 2, PAGE.h - 10, { align: 'center' });
    doc.setTextColor(0);
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function safeFilename(name: string): string {
  return (
    name
      .replace(/[/\\?%*:|"<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || 'story'
  );
}
