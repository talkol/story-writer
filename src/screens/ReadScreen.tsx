import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import AchievementPage from '../components/AchievementPage';
import AchievementsSheet from '../components/AchievementsSheet';
import ChapterFlow from '../components/ChapterFlow';
import EndPage from '../components/EndPage';
import Icon from '../components/Icon';
import NavBar, { BackButton, NavButton } from '../components/NavBar';
import { useGeneration, useThrottled } from '../ai/useGeneration';
import { collectWordAnchors, topOfWord, wordIndexAtY } from '../reader/anchors';
import { buildPages, firstPageOfChapter, type PageRef } from '../reader/pages';
import { useChapterSlices, useDebouncedEffect, useReaderMetrics } from '../reader/useReader';
import { loadSettings } from '../storage/settings';
import { updateStory } from '../storage/stories';
import { useStory } from '../storage/useStories';
import { chapterCount, type Chapter, type Story } from '../types';

const TURN_MS = 380;

/**
 * How long a new book's title stays on screen once it appears.
 *
 * The title arrives about a second before the first prose token, so without a floor the
 * moment can be over before it registers — and the gap varies with how fast the model
 * responds. Holding it makes the opening consistent rather than a flicker.
 */
const MIN_TITLE_MS = 4000;

/**
 * With reduced motion the leaf is faded out instantly by CSS, so holding the turn open
 * for its full duration would just be a third of a second of ignored taps with nothing
 * on screen to explain the wait.
 */
function turnDuration(): number {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : TURN_MS;
}

type Turn = { from: number; to: number; direction: 'forward' | 'back' } | null;

export default function ReadScreen({ showAchievements = false }: { showAchievements?: boolean }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const story = useStory(id);

  const stageRef = useRef<HTMLDivElement>(null);
  const measurerRef = useRef<HTMLDivElement>(null);

  const [fontScale] = useState(() => loadSettings().fontScale);
  const metrics = useReaderMetrics(stageRef, fontScale);

  const gen = useGeneration(story);

  // Measuring on every token would re-paginate the book hundreds of times a chapter.
  // Appending never moves earlier text, so a throttled copy is safe: page counts only
  // grow, and pages the reader has already seen keep their boundaries.
  const liveProse = gen.state.status === 'writing' ? gen.state.prose : '';
  const isWriting = gen.state.status === 'writing';
  const throttledProse = useThrottled(liveProse, 500);
  // The throttle is bypassed the moment writing stops. Letting it lag would leave the
  // provisional chapter on screen next to the committed one for a beat.
  const streaming = isWriting ? throttledProse : '';

  /** The story as the reader should see it, including any chapter still arriving. */
  const displayStory = useMemo(() => {
    if (!story || !streaming.trim()) return story;
    return {
      ...story,
      chapters: [
        ...story.chapters,
        { kind: 'prose' as const, index: story.chapters.length, text: streaming },
      ],
    };
  }, [story, streaming]);

  const proseChapters = useMemo(
    () =>
      (displayStory?.chapters ?? [])
        .map((chapter, index) => ({ chapter, index }))
        .filter((c): c is { chapter: Extract<Chapter, { kind: 'prose' }>; index: number } =>
          c.chapter.kind === 'prose',
        ),
    [displayStory?.chapters],
  );

  // Changing text or column width invalidates every measurement.
  const signature = useMemo(
    () =>
      `${metrics?.columnWidth}:${metrics?.lineHeight}:${displayStory?.chapters.length}:` +
      proseChapters.map((c) => c.chapter.text.length).join(','),
    [metrics?.columnWidth, metrics?.lineHeight, displayStory?.chapters.length, proseChapters],
  );

  const slices = useChapterSlices(measurerRef, metrics, signature);
  const pages = useMemo(
    () => (displayStory && slices.length ? buildPages(displayStory, slices) : []),
    [displayStory, slices],
  );

  const [page, setPage] = useState(0);
  const [turn, setTurn] = useState<Turn>(null);
  const [chromeHidden, setChromeHidden] = useState(false);
  const anchoredAtRef = useRef<string | null>(null);

  const step = metrics?.columns ?? 1;
  const lastPage = Math.max(0, pages.length - 1);

  const jumpToChapterRef = useRef<number | null>(null);
  const titleSeenAtRef = useRef<number | null>(null);
  const [titleHoldDone, setTitleHoldDone] = useState(false);

  const visiblePage = turn ? turn.to : page;

  /**
   * The index the arriving chapter will occupy. While a request is in flight
   * `story.chapters` still holds only committed chapters, so its length is exactly the
   * index `displayStory` gives the streaming copy.
   */
  const pendingChapterIndex = story?.chapters.length ?? 0;
  const readerIsOnPending =
    pages.length > 0 &&
    pages[Math.min(visiblePage, lastPage)]?.chapterIndex === pendingChapterIndex;
  const isFirstChapter = story ? chapterCount(story) === 0 : false;

  /**
   * Covers the stage for as long as a chapter is being written and there is nothing of
   * it to read.
   *
   * Without it the reader is stranded on the last page of the previous chapter — a page
   * they have just finished, with nothing after it to turn to — for however long the
   * model takes. The cover lifts on `readerIsOnPending` rather than on "a page exists",
   * because the jump to that page happens in an effect: lifting a render earlier would
   * flash the old page for a frame before the reader is moved off it.
   *
   * A brand-new book holds its title on top of that, for MIN_TITLE_MS.
   */
  const showWriting =
    isWriting &&
    (!readerIsOnPending ||
      (isFirstChapter && titleSeenAtRef.current !== null && !titleHoldDone));

  /**
   * Anchors the visible page to the stored word offset. Runs on first measurement and
   * again whenever the layout changes — a rotation, a split-view resize, or a
   * font-size change re-paginates the whole book, and keeping the raw page index
   * would silently move the reader somewhere else. Guarded on the layout signature so
   * ordinary story updates (including this screen's own position saves) do not
   * re-trigger it.
   */
  useEffect(() => {
    if (!story || !pages.length || !metrics) return;
    const layoutSig = `${metrics.columnWidth}x${metrics.pageHeight}`;
    if (anchoredAtRef.current === layoutSig) return;
    anchoredAtRef.current = layoutSig;

    const { chapterIndex, wordOffset } = story.readingPosition;
    const base = firstPageOfChapter(pages, chapterIndex);
    let target = base;

    if (wordOffset > 0) {
      const flow = measurerRef.current?.querySelector<HTMLElement>(
        `[data-chapter="${chapterIndex}"]`,
      );
      if (flow) {
        const anchors = collectWordAnchors(flow);
        const y = topOfWord(flow, anchors, wordOffset);
        target = base + Math.floor(y / metrics.pageHeight);
      }
    }
    setPage(clampToStep(Math.min(target, pages.length - 1), step));
  }, [story, pages, metrics, step]);

  // Persist as a word offset, not a page number: page numbers do not survive a
  // rotation or a font-size change, the word the reader stopped at does.
  useDebouncedEffect(
    () => {
      if (!story || !pages.length || !metrics || anchoredAtRef.current === null) return;
      const ref = pages[Math.min(page, lastPage)];
      if (!ref) return;

      let wordOffset = 0;
      if (ref.kind === 'prose' && ref.sliceIndex > 0) {
        const flow = measurerRef.current?.querySelector<HTMLElement>(
          `[data-chapter="${ref.chapterIndex}"]`,
        );
        if (flow) {
          const anchors = collectWordAnchors(flow);
          wordOffset = wordIndexAtY(flow, anchors, ref.sliceIndex * metrics.pageHeight);
        }
      }
      const current = story.readingPosition;
      if (current.chapterIndex === ref.chapterIndex && current.wordOffset === wordOffset) return;
      updateStory(story.id, { readingPosition: { chapterIndex: ref.chapterIndex, wordOffset } });
    },
    400,
    [page, pages.length, story?.id, metrics?.pageHeight],
  );

  const storyId = story?.id;
  // A chapter committed without its metadata leaves the story with no usable choices.
  const needsRepair = !!story?.chapters.some((c) => c.kind === 'prose' && c.metaMissing);
  const canChoose =
    !!story && story.pendingActions.length > 0 && !isWriting && !needsRepair;

  const go = useCallback(
    (direction: 'forward' | 'back') => {
      if (turn) return; // ignore taps mid-turn rather than queueing them up
      // Nothing behind the cover is meant to be navigable — the reader is waiting for
      // a chapter, not reading the previous one.
      if (showWriting) return;
      const next = direction === 'forward' ? page + step : page - step;

      // Flipping past the end of what has been written is how the reader asks what
      // happens next — the spec's "after the user flips to the last page".
      if (direction === 'forward' && next > lastPage) {
        if (canChoose) navigate(`/story/${storyId}/actions`);
        return;
      }
      if (next < 0 || next > lastPage) return;
      const duration = turnDuration();
      if (duration === 0) {
        setPage(next);
        return;
      }
      setTurn({ from: page, to: next, direction });
      window.setTimeout(() => {
        setPage(next);
        setTurn(null);
      }, duration);
    },
    [page, step, lastPage, turn, canChoose, navigate, storyId, showWriting],
  );

  const hasTitle = Boolean(story?.title);
  const noPagesYet = pages.length === 0;
  const holdTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (titleSeenAtRef.current !== null) return;
    // Only claim the screen if nothing is being read yet.
    if (!hasTitle || !noPagesYet) return;

    titleSeenAtRef.current = Date.now();
    // Deliberately not cleaned up on dependency change. `noPagesYet` flips the moment
    // the first page mounts, and a cleanup here cancelled the hold timer at exactly
    // that point — so it never fired and the title stayed up until generation ended.
    holdTimerRef.current = window.setTimeout(() => setTitleHoldDone(true), MIN_TITLE_MS);
  }, [hasTitle, noPagesYet]);

  useEffect(
    () => () => {
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') go('forward');
      if (e.key === 'ArrowLeft') go('back');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const location = useLocation();
  const handoff = location.state as { chosenAction?: string; afterChapters?: number } | null;
  const chosenAction = handoff?.chosenAction;

  /**
   * The Actions screen hands the chosen sentence over in history state, and it stays
   * there until the chapter it produced has committed.
   *
   * The guard is an invariant rather than a one-shot flag: the choice carries the
   * chapter count from the moment it was made, and only fires while the story still
   * has exactly that many chapters. The instant a chapter commits the count moves on,
   * so the choice cannot fire twice — not on a refresh, and not if the model happens
   * to offer the same sentence again. A request aborted for some other reason (leaving
   * the screen, or StrictMode's remount in development) leaves the count untouched and
   * simply starts again.
   */
  useEffect(() => {
    if (!story || !chosenAction) return;
    if (gen.state.status !== 'idle') return;

    if (handoff?.afterChapters !== story.chapters.length) {
      // Already spent. Drop it from history so a later reload sees nothing.
      navigate(location.pathname, { replace: true, state: null });
      return;
    }

    jumpToChapterRef.current = story.chapters.length;
    void gen.start(chosenAction);
  }, [chosenAction, handoff?.afterChapters, location.pathname, story, gen, navigate]);

  /**
   * A freshly created story has nothing in it; write chapter one on arrival.
   *
   * The condition is the actual state rather than a one-shot flag, so a request
   * aborted by something other than the reader (leaving the screen, or StrictMode's
   * remount in development) starts again. It deliberately does not fire on 'error' or
   * 'cancelled': a failure must never be retried automatically, and a reader who
   * pressed Cancel must not have it restarted for them.
   */
  useEffect(() => {
    if (!story || gen.state.status !== 'idle') return;
    if (story.chapters.length > 0 || story.status !== 'draft') return;
    jumpToChapterRef.current = 0;
    void gen.start();
  }, [story, gen]);

  // When a chapter starts arriving, move the reader to its first page.
  useEffect(() => {
    const target = jumpToChapterRef.current;
    if (target === null || !pages.length) return;
    const first = pages.findIndex((p) => p.chapterIndex === target);
    if (first === -1) return;
    jumpToChapterRef.current = null;
    setPage(clampToStep(first, step));
  }, [pages, step]);

  if (!story) return <Navigate to="/library" replace />;

  function handleTap(e: React.MouseEvent<HTMLDivElement>) {
    if (showWriting) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    if (x < 0.33) go('back');
    else if (x > 0.67) go('forward');
    else setChromeHidden((v) => !v);
  }

  // The choices are offered only once the reader has actually reached the end of what
  // has been written — the point the spec calls "the last generated page".
  const onLastPage = pages.length > 0 && visiblePage + step >= pages.length;
  const showNextPrompt = onLastPage && canChoose;
  const isLastChapter = chapterCount(story) + 1 >= story.totalChapters;

  const visible = visiblePage;
  const chapterNumber = pages[Math.min(visible, lastPage)]
    ? countProseChaptersTo(displayStory!, pages[Math.min(visible, lastPage)].chapterIndex)
    : 0;

  return (
    <>
      <div className={`reader${chromeHidden ? ' reader--immersive' : ''}`}>
        <NavBar
          // Naming the book in the bar while chapter one streams costs no layout —
          // a banner over the stage would shrink it and re-paginate mid-write.
          title={isWriting && chapterCount(story) === 0 && story.title ? story.title : 'Read'}
          left={<BackButton label="Library" onClick={() => navigate('/library')} />}
          right={
            <>
              <NavButton
                label="Achievements"
                onClick={() =>
                  showAchievements
                    ? navigate(`/story/${story.id}/read`, { replace: true })
                    : navigate(`/story/${story.id}/achievements`)
                }
              >
                <Icon name="trophy" size={21} />
              </NavButton>
              <NavButton
                label="Genre and setting"
                onClick={() => navigate(`/story/${story.id}/genre`)}
              >
                <Icon name="sliders-horizontal" size={21} />
              </NavButton>
            </>
          }
        />

        <div
          className="stage"
          onClick={handleTap}
          onTouchStart={(e) => {
            touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          }}
          onTouchEnd={(e) => {
            const start = touchStart.current;
            touchStart.current = null;
            if (!start) return;
            const dx = e.changedTouches[0].clientX - start.x;
            const dy = e.changedTouches[0].clientY - start.y;
            // Horizontal intent only, so a vertical scroll gesture never turns a page.
            if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
            go(dx < 0 ? 'forward' : 'back');
          }}
        >
          {/* The ref sits on the inner box so metrics measure the content area, not
              the stage's padding — otherwise pages are as wide as the screen and the
              margins disappear. */}
          <div className="stage__inner" ref={stageRef}>
          {metrics && pages.length > 0 && (
            <div className={`spread${metrics.columns === 2 ? ' spread--double' : ''}`}>
              {Array.from({ length: metrics.columns }, (_, column) => {
                const index = (turn ? turn.to : page) + column;
                const leavingIndex = turn ? turn.from + column : -1;
                return (
                  <div className="leafbox" key={column}>
                    <Page story={displayStory!} pages={pages} index={index} metrics={metrics} />
                    {turn && (
                      <div
                        className={`leaf leaf--${spineSide(metrics.columns, column, turn.direction)}`}
                        style={{ animationDuration: `${TURN_MS}ms` }}
                      >
                        <Page
                          story={displayStory!}
                          pages={pages}
                          index={leavingIndex}
                          metrics={metrics}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/*
            An overlay, deliberately outside the layout flow. Rendering this in the
            column would shrink the stage, which re-paginates the book, which changes
            which page is last, which hides the affordance again — an oscillation that
            makes the final page unreachable.
          */}
          {showNextPrompt && (
            <div className="nextbar">
              <button
                type="button"
                className="btn btn--primary btn--block"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/story/${story.id}/actions`);
                }}
              >
                {isLastChapter ? 'Choose how it ends' : 'What happens next?'}
              </button>
            </div>
          )}

          {metrics && pages.length === 0 && gen.state.status !== 'writing' && (
            <div className="reader__empty">
              <p>Nothing written yet.</p>
              <p className="reader__empty-meta">
                {story.audience} · {story.genre} · {story.setting} — {story.totalChapters}{' '}
                chapters
              </p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  jumpToChapterRef.current = story.chapters.length;
                  void gen.start();
                }}
              >
                Write chapter one
              </button>
            </div>
          )}

          {showWriting && (
            <div
              className="reader__opening"
              // The cover sits inside the stage, so without this a tap on it would
              // bubble out and turn a page of the book underneath.
              onClick={(e) => e.stopPropagation()}
              role="status"
              aria-live="polite"
            >
              {story.title ? (
                <>
                  {/* The title is named by its own call and usually lands before the
                      prose does. Showing it turns the wait into the book arriving. */}
                  {isFirstChapter && <p className="reader__opening-label">A new book</p>}
                  <h2 className="reader__opening-title">{story.title}</h2>
                  <p className="reader__opening-status">
                    Writing chapter {chapterCount(story) + 1} of {story.totalChapters}…
                  </p>
                </>
              ) : (
                <p className="reader__thinking">Thinking of a title…</p>
              )}
            </div>
          )}
          </div>
        </div>

        <footer className="pagebar">
          {gen.state.status === 'writing' ? (
            <span className="pagebar__live">
              <span className="pagebar__pulse" aria-hidden="true" />
              Writing chapter {chapterCount(story) + 1} of {story.totalChapters}
              <button type="button" className="pagebar__action" onClick={gen.cancel}>
                Cancel
              </button>
            </span>
          ) : (
            <span>
              {pages.length > 0
                ? `Chapter ${chapterNumber} · page ${Math.min(visible + 1, pages.length)} of ${pages.length}`
                : story.title}
            </span>
          )}
        </footer>
      </div>

      {gen.state.status === 'error' && (
        <div className="genbanner" role="alert">
          <p className="genbanner__msg">{gen.state.message}</p>
          <div className="genbanner__actions">
            <button type="button" className="btn" onClick={gen.dismissError}>
              Dismiss
            </button>
            <button type="button" className="btn" onClick={() => navigate('/settings')}>
              Settings
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                // A repair rewrites metadata in place; only a real retry produces a
                // chapter to land on.
                if (needsRepair) {
                  void gen.repair();
                  return;
                }
                jumpToChapterRef.current = story.chapters.length;
                void gen.start(chosenAction);
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {needsRepair && gen.state.status === 'idle' && (
        <div className="genbanner" role="status">
          <p className="genbanner__msg">
            This chapter arrived without its choices. The text is safe — only the
            four options and the summary are missing.
          </p>
          <div className="genbanner__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void gen.repair()}
            >
              Get the choices
            </button>
          </div>
        </div>
      )}

      {showAchievements && (
        <AchievementsSheet
          achievements={story.achievements}
          totalChapters={story.totalChapters}
          onClose={() => navigate(`/story/${story.id}/read`, { replace: true })}
        />
      )}

      {/*
        Hidden measurer: every chapter laid out once at the real column width. One
        layout pass yields the page count for the whole book, and the Range lookups
        that convert between page and word offset read from it.
      */}
      <div className="measurer" ref={measurerRef} aria-hidden="true">
        {metrics &&
          proseChapters.map(({ chapter, index }) => (
            <div key={index} data-chapter={index} className="measurer__item">
              <ChapterFlow
                text={chapter.text}
                metrics={metrics}
                heading={`Chapter ${countProseChaptersTo(displayStory!, index)}`}
              />
            </div>
          ))}
      </div>
    </>
  );
}

function Page({
  story,
  pages,
  index,
  metrics,
}: {
  story: Story;
  pages: PageRef[];
  index: number;
  metrics: ReturnType<typeof useReaderMetrics>;
}) {
  if (!metrics) return null;
  const ref = pages[index];
  if (!ref)
    return (
      <div
        className="page page--blank"
        style={{ width: metrics.pageBoxWidth, height: metrics.pageBoxHeight }}
      />
    );

  const box = {
    width: metrics.pageBoxWidth,
    height: metrics.pageBoxHeight,
    padding: `${metrics.padY}px ${metrics.padX}px`,
  };

  if (ref.kind === 'end') {
    return (
      <div className="page" style={box}>
        <EndPage metrics={metrics} />
      </div>
    );
  }

  if (ref.kind === 'achievement') {
    return (
      <div className="page" style={box}>
        <AchievementPage
          achievement={story.achievements.find((a) => a.id === ref.achievementId)}
          metrics={metrics}
        />
      </div>
    );
  }

  if (ref.kind !== 'prose') return <div className="page page--blank" style={box} />;

  const chapter = story.chapters[ref.chapterIndex];
  if (chapter?.kind !== 'prose') return <div className="page page--blank" style={box} />;

  return (
    <div className="page" style={box}>
      <div className="page__clip" style={{ height: metrics.pageHeight }}>
        <ChapterFlow
          text={chapter.text}
          metrics={metrics}
          sliceIndex={ref.sliceIndex}
          heading={`Chapter ${countProseChaptersTo(story, ref.chapterIndex)}`}
        />
      </div>
    </div>
  );
}

/** Chapter number as the reader counts them, ignoring achievement interludes. */
function countProseChaptersTo(story: Story, chapterIndex: number): number {
  let n = 0;
  for (let i = 0; i <= chapterIndex && i < story.chapters.length; i++) {
    if (story.chapters[i].kind === 'prose') n++;
  }
  return Math.max(1, n);
}

/**
 * Which edge the leaf pivots on. In a single-page view the spine is always the left
 * edge going forward and the right edge going back. In a spread the spine is the
 * inner edge, so the left-hand page pivots on its right edge and the right-hand page
 * on its left — the same way a real book opens.
 */
function spineSide(
  columns: number,
  column: number,
  direction: 'forward' | 'back',
): 'left' | 'right' {
  if (columns === 1) return direction === 'forward' ? 'left' : 'right';
  return column === 0 ? 'right' : 'left';
}

/** Keeps the spread aligned so a two-up view always starts on an even page. */
function clampToStep(page: number, step: number): number {
  return step === 1 ? page : Math.floor(page / step) * step;
}
