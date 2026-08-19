import { Fragment, forwardRef, type ReactNode } from 'react';
import { toParagraphs } from '../reader/pages';
import type { ReaderMetrics } from '../reader/layout';

interface Props {
  text: string;
  metrics: ReaderMetrics;
  /** Vertical slice to show, in pages. Omitted by the hidden measurer. */
  sliceIndex?: number;
}

/**
 * One chapter laid out as a single continuous column. The visible page is produced by
 * translating this flow upward by whole page heights, so every page is a slice of one
 * layout rather than a separate re-flow.
 */
const ChapterFlow = forwardRef<HTMLDivElement, Props>(function ChapterFlow(
  { text, metrics, sliceIndex = 0 },
  ref,
) {
  return (
    <div
      ref={ref}
      className="flow"
      lang="en"
      style={{
        width: `${metrics.columnWidth}px`,
        fontSize: `${metrics.fontSize}px`,
        lineHeight: `${metrics.lineHeight}px`,
        transform: `translateY(${-sliceIndex * metrics.pageHeight}px)`,
        // Paragraph spacing is exactly one line, keeping the flow on the grid.
        ['--para-gap' as string]: `${metrics.lineHeight}px`,
      }}
    >
      {toParagraphs(text).map((paragraph, i) => (
        <p key={i}>{renderInline(paragraph)}</p>
      ))}
    </div>
  );
});

/**
 * Renders *emphasis* as italics. Language models emit markdown emphasis routinely
 * even when asked for plain prose, and raw asterisks in the middle of a page are a
 * visible defect. Deliberately limited to this one construct — the reader is not a
 * markdown renderer, and inline elements do not disturb the line grid.
 */
function renderInline(text: string): ReactNode {
  if (!text.includes('*')) return text;

  const parts: ReactNode[] = [];
  const pattern = /\*([^*\n]+)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(<em key={match.index}>{match[1]}</em>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return parts.map((part, i) => <Fragment key={i}>{part}</Fragment>);
}

export default ChapterFlow;
