import type { FontScale } from '../types';

/**
 * The reader lays each chapter out as one continuous flow and shows a page by
 * translating that flow vertically inside a clipping box. Pages are therefore exact
 * slices of a single layout, which means what was measured is exactly what is
 * rendered — no re-flowing a slice and hoping the line breaks land the same way.
 *
 * For that to work the flow must sit on a line grid: every vertical measurement is a
 * whole number of lines, so a slice boundary never falls through the middle of a line
 * of text. Paragraph spacing is therefore exactly one line, and the page height is
 * rounded down to a whole number of lines.
 */

const BASE_FONT_SIZE = 19;
const LINE_RATIO = 1.6;

export interface ReaderMetrics {
  fontSize: number;
  lineHeight: number;
  /** Height of one page, always a whole multiple of lineHeight. */
  pageHeight: number;
  /** Width of a single page column (half the stage, minus the gutter, on a spread). */
  columnWidth: number;
  /** 1 on phones and in portrait, 2 for the iPad landscape spread. */
  columns: number;
}

export function computeMetrics(
  stageWidth: number,
  stageHeight: number,
  fontScale: FontScale,
  spread: boolean,
): ReaderMetrics | null {
  if (stageWidth <= 0 || stageHeight <= 0) return null;

  const fontSize = Math.round(BASE_FONT_SIZE * fontScale);
  // Integer line height: fractional values accumulate rounding error down the page
  // and the grid stops lining up with the slice boundaries.
  const lineHeight = Math.round(fontSize * LINE_RATIO);

  const columns = spread ? 2 : 1;
  const gutter = spread ? 48 : 0;
  const columnWidth = Math.floor((stageWidth - gutter) / columns);

  const lines = Math.max(1, Math.floor(stageHeight / lineHeight));
  const pageHeight = lines * lineHeight;

  return { fontSize, lineHeight, pageHeight, columnWidth, columns };
}

/**
 * A two-page spread only makes sense when the stage is genuinely wide — an iPad in
 * landscape, not a phone turned sideways, where two columns would be unreadably narrow.
 */
export function shouldSpread(stageWidth: number, stageHeight: number): boolean {
  return stageWidth >= 820 && stageWidth > stageHeight;
}

/** Pages a flow of this height occupies. Always at least one, even when empty. */
export function pageCountFor(contentHeight: number, pageHeight: number): number {
  if (pageHeight <= 0) return 1;
  return Math.max(1, Math.ceil(contentHeight / pageHeight));
}
