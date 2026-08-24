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
 * Milliseconds to wait for the reader's face before paginating without it.
 *
 * The ceiling matters more than the font does. If the WOFF2 never arrives the book
 * still has to be readable, so a stalled load degrades to the fallback serif rather
 * than leaving the reader staring at an empty stage.
 */
const FONT_TIMEOUT_MS = 3000;

/**
 * Resolves once the book face is usable — or once waiting stops being worth it.
 *
 * Pagination slices a chapter by measuring its real rendered height, so measuring
 * while the fallback serif is still standing in produces page breaks for a font the
 * reader will never see. Asking for the faces by name starts the load even before
 * anything has been laid out in them, which is what makes `fonts.ready` mean what it
 * says at this point in startup.
 *
 * Memoised on first call rather than run at module scope, and deliberately so:
 * `main.tsx` imports `App` — and through it this module — before it imports the
 * stylesheet that declares the face. Asking at module scope would ask before any
 * @font-face existed, match nothing, and resolve having loaded nothing. First call
 * comes from an effect, by which point the CSS is applied.
 */
let bookFaceReady: Promise<void> | null = null;

function whenBookFaceReady(): Promise<void> {
  if (bookFaceReady) return bookFaceReady;
  if (typeof document === 'undefined' || !document.fonts) {
    bookFaceReady = Promise.resolve();
    return bookFaceReady;
  }
  const faces = [
    '400 1rem Literata',
    'italic 400 1rem Literata',
    '700 1rem Literata',
    'italic 700 1rem Literata',
  ];
  const loaded = Promise.all(faces.map((face) => document.fonts.load(face)))
    .then(() => document.fonts.ready)
    .then(() => undefined);
  const ceiling = new Promise<void>((resolve) => {
    window.setTimeout(resolve, FONT_TIMEOUT_MS);
  });
  bookFaceReady = Promise.race([loaded, ceiling]).catch(() => undefined);
  return bookFaceReady;
}

function useBookFaceReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void whenBookFaceReady().then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

/**
 * Measures how many pages each prose chapter occupies.
 *
 * The measurer holds every chapter's flow at the real column width, so this is one
 * layout pass for the whole book rather than one per chapter. `signature` exists so
 * the measurement re-runs when the text or the metrics change, but not on unrelated
 * re-renders.
 *
 * The first pass may land while the fallback serif is still showing, so it runs again
 * when the book face arrives and the flow reflows underneath it.
 */
export function useChapterSlices(
  measurerRef: RefObject<HTMLElement | null>,
  metrics: ReaderMetrics | null,
  signature: string,
): number[] {
  const [slices, setSlices] = useState<number[]>([]);
  const faceReady = useBookFaceReady();

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
  }, [measurerRef, metrics, signature, faceReady]);

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
