import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { computeMetrics, pageCountFor, shouldSpread, type ReaderMetrics } from './layout';
import type { FontScale } from '../types';

/**
 * Tracks the stage's box and derives the reader metrics from it. Recomputes on
 * resize, orientation change, and font-scale change — the three things that
 * invalidate every page boundary in the book.
 */
export function useReaderMetrics(
  stageRef: RefObject<HTMLElement | null>,
  fontScale: FontScale,
): ReaderMetrics | null {
  const [metrics, setMetrics] = useState<ReaderMetrics | null>(null);

  const measure = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const next = computeMetrics(width, height, fontScale, shouldSpread(width, height));
    setMetrics((prev) => (sameMetrics(prev, next) ? prev : next));
  }, [stageRef, fontScale]);

  useLayoutEffect(() => {
    measure();

    const el = stageRef.current;
    if (!el) return;

    // ResizeObserver covers rotation, split-view resizing, and the iOS toolbar
    // collapsing, all of which change the stage without a window resize event.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('orientationchange', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', measure);
    };
  }, [measure, stageRef]);

  return metrics;
}

function sameMetrics(a: ReaderMetrics | null, b: ReaderMetrics | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.fontSize === b.fontSize &&
    a.lineHeight === b.lineHeight &&
    a.pageHeight === b.pageHeight &&
    a.columnWidth === b.columnWidth &&
    a.pageBoxWidth === b.pageBoxWidth &&
    a.pageBoxHeight === b.pageBoxHeight &&
    a.columns === b.columns
  );
}

/**
 * Measures how many pages each prose chapter occupies.
 *
 * The measurer holds every chapter's flow at the real column width, so this is one
 * layout pass for the whole book rather than one per chapter. `signature` exists so
 * the measurement re-runs when the text or the metrics change, but not on unrelated
 * re-renders.
 */
export function useChapterSlices(
  measurerRef: RefObject<HTMLElement | null>,
  metrics: ReaderMetrics | null,
  signature: string,
): number[] {
  const [slices, setSlices] = useState<number[]>([]);

  useLayoutEffect(() => {
    const root = measurerRef.current;
    if (!root || !metrics) return;

    const flows = Array.from(root.querySelectorAll<HTMLElement>('[data-chapter]'));
    const next: number[] = [];
    for (const flow of flows) {
      const chapterIndex = Number(flow.dataset.chapter);
      next[chapterIndex] = pageCountFor(flow.scrollHeight, metrics.pageHeight);
    }
    setSlices((prev) => (sameCounts(prev, next) ? prev : next));
  }, [measurerRef, metrics, signature]);

  return slices;
}

function sameCounts(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/** Debounced persistence, so paging quickly does not hammer localStorage. */
export function useDebouncedEffect(fn: () => void, delay: number, deps: unknown[]) {
  useEffect(() => {
    const id = window.setTimeout(fn, delay);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
