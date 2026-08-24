import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyChapter,
  applyRepairedMeta,
  describeGenerationError,
  generateChapter,
  repairMeta,
} from './generate';
import { loadSettings } from '../storage/settings';
import type { Story } from '../types';

export type GenerationState =
  | { status: 'idle' }
  /** The reader stopped it deliberately; nothing should restart it on their behalf. */
  | { status: 'cancelled' }
  | { status: 'writing'; prose: string }
  | { status: 'error'; message: string };

/**
 * Owns one chapter generation at a time. The streamed prose lives here rather than in
 * the store: committing every token to localStorage would be thousands of writes per
 * chapter, and a half-written chapter has no business surviving a reload.
 */
export function useGeneration(story: Story | undefined) {
  const [state, setState] = useState<GenerationState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);
  // Distinguishes "the reader pressed Cancel" from "the request was aborted for some
  // other reason" — leaving the screen, or StrictMode's remount in development.
  const cancelledByUserRef = useRef(false);

  // Abandon an in-flight request if the reader leaves the screen.
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(
    async (chosenAction?: string) => {
      if (!story || runningRef.current) return;

      const apiKey = loadSettings().apiKey;
      if (!apiKey) {
        setState({ status: 'error', message: 'No API key. Add one in Settings to write.' });
        return;
      }
      // Checked up front so the reader gets the real reason rather than a fetch
      // failure dressed up as an OpenAI outage.
      if (!navigator.onLine) {
        setState({
          status: 'error',
          message: 'You are offline. Chapters are written by OpenAI, so this needs a connection.',
        });
        return;
      }

      runningRef.current = true;
      cancelledByUserRef.current = false;
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ status: 'writing', prose: '' });

      try {
        const result = await generateChapter({
          story,
          apiKey,
          chosenAction,
          signal: controller.signal,
          onProse: (prose) => setState({ status: 'writing', prose }),
        });
        applyChapter(story, result);
        setState({ status: 'idle' });
      } catch (err) {
        if (controller.signal.aborted) {
          setState(cancelledByUserRef.current ? { status: 'cancelled' } : { status: 'idle' });
        } else {
          setState({ status: 'error', message: describeGenerationError(err) });
        }
      } finally {
        runningRef.current = false;
        abortRef.current = null;
      }
    },
    [story],
  );

  /** Recovers the choices for a chapter whose stream died before the metadata. */
  const repair = useCallback(async () => {
    if (!story || runningRef.current) return;
    const apiKey = loadSettings().apiKey;
    if (!apiKey) {
      setState({ status: 'error', message: 'No API key. Add one in Settings to write.' });
      return;
    }
    if (!navigator.onLine) {
      setState({ status: 'error', message: 'You are offline. This needs a connection.' });
      return;
    }

    runningRef.current = true;
    cancelledByUserRef.current = false;
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'writing', prose: '' });

    try {
      const meta = await repairMeta({ story, apiKey, signal: controller.signal });
      applyRepairedMeta(story, meta);
      setState({ status: 'idle' });
    } catch (err) {
      setState(
        controller.signal.aborted
          ? cancelledByUserRef.current
            ? { status: 'cancelled' }
            : { status: 'idle' }
          : { status: 'error', message: describeGenerationError(err) },
      );
    } finally {
      runningRef.current = false;
      abortRef.current = null;
    }
  }, [story]);

  const cancel = useCallback(() => {
    cancelledByUserRef.current = true;
    abortRef.current?.abort();
  }, []);
  const dismissError = useCallback(() => setState({ status: 'idle' }), []);

  return { state, start, repair, cancel, dismissError, isWriting: state.status === 'writing' };
}

/**
 * Rate-limits a rapidly changing value. Streamed prose arrives token by token; the
 * pagination measurer must not re-run that often. Appending never moves earlier text,
 * so measuring on a delay is safe — page counts only ever grow.
 */
export function useThrottled<T>(value: T, ms: number): T {
  const [throttled, setThrottled] = useState(value);
  const lastRun = useRef(0);

  useEffect(() => {
    const elapsed = Date.now() - lastRun.current;
    if (elapsed >= ms) {
      lastRun.current = Date.now();
      setThrottled(value);
      return;
    }
    const id = window.setTimeout(() => {
      lastRun.current = Date.now();
      setThrottled(value);
    }, ms - elapsed);
    return () => window.clearTimeout(id);
  }, [value, ms]);

  return throttled;
}
