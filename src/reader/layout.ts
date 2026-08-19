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

/**
 * Page margins live on the page itself, not on the stage around it. That makes the
 * page element the whole physical page, so the turning leaf carries its margins with
 * it instead of animating a bare block of text.
 */
const PAGE_PAD_X = 22;
const PAGE_PAD_Y = 10;

export interface ReaderMetrics {
  fontSize: number;
  lineHeight: number;
  /** Height of the text area, always a whole multiple of lineHeight. */
  pageHeight: number;
  /** Width of the text area within a page. */
  columnWidth: number;
  /** Outer size of the whole page, margins included — the box the leaf animates. */
  pageBoxWidth: number;
  pageBoxHeight: number;
  padX: number;
  padY: number;
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
  const gutter = spread ? 40 : 0;

  const pageBoxWidth = Math.floor((stageWidth - gutter) / columns);
  const columnWidth = pageBoxWidth - PAGE_PAD_X * 2;

  const lines = Math.max(1, Math.floor((stageHeight - PAGE_PAD_Y * 2) / lineHeight));
  const pageHeight = lines * lineHeight;
  const pageBoxHeight = pageHeight + PAGE_PAD_Y * 2;

  // Too narrow to typeset — the caller renders nothing rather than garbage.
  if (columnWidth < 120) return null;

  return {
    fontSize,
    lineHeight,
    pageHeight,
    columnWidth,
    pageBoxWidth,
    pageBoxHeight,
    padX: PAGE_PAD_X,
    padY: PAGE_PAD_Y,
    columns,
  };
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
