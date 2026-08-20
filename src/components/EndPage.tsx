import type { ReaderMetrics } from '../reader/layout';

/**
 * The closing page of a finished book. Derived from the story's status rather than
 * stored, so it appears the moment the final chapter commits and cannot drift out of
 * sync with it.
 */
export default function EndPage({ metrics }: { metrics: ReaderMetrics }) {
  return (
    <div
      className="end-page"
      style={{ fontSize: `${metrics.fontSize}px`, ['--ach-rhythm' as string]: `${metrics.lineHeight}px` }}
    >
      <p className="end-page__rule" aria-hidden="true">
        ❧
      </p>
      <h2 className="end-page__title">The End</h2>
    </div>
  );
}
