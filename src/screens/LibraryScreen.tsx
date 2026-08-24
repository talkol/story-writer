import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { coverBlocker, isCoverPending, regenerateCover } from '../ai/coverReconciler';
import { exportStoryToPdf } from '../pdf/exportStory';
import ActionSheet, { type SheetItem } from '../components/ActionSheet';
import CoverTile, { CreateTile } from '../components/CoverTile';
import Icon from '../components/Icon';
import NavBar, { LargeTitle, NavButton, useScrollRef } from '../components/NavBar';
import { deleteStoryAndCover } from '../storage/library';
import { hasApiKey } from '../storage/settings';
import { useStories } from '../storage/useStories';
import { chapterCount, type Story } from '../types';

type Sheet =
  | { kind: 'menu'; story: Story }
  | { kind: 'confirmRemove'; story: Story }
  | null;

export default function LibraryScreen() {
  const navigate = useNavigate();
  const stories = useStories();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [exporting, setExporting] = useState<{ title: string; stage: string } | null>(null);
  const scrollRef = useScrollRef();

  function openStory(story: Story) {
    navigate(`/story/${story.id}/read`);
  }

  function startCreate() {
    // A story cannot be generated without a key, so route to Settings first rather
    // than letting the user pick a genre and hit a wall.
    navigate(hasApiKey() ? '/new' : '/settings?next=/new');
  }

  const sheetItems: SheetItem[] =
    sheet?.kind === 'menu'
      ? [
          {
            label: 'Export PDF',
            disabled: sheet.story.chapters.length === 0,
            onSelect: () => {
              const story = sheet.story;
              setSheet(null);
              void runExport(story);
            },
          },
          {
            // One item for both cases: draw a cover that failed, or replace one the
            // reader does not like.
            label: isCoverPending(sheet.story) ? 'Retry cover' : 'Regenerate cover',
            disabled: coverBlocker() !== null,
            onSelect: () => {
              regenerateCover(sheet.story.id);
              setSheet(null);
            },
          },
          {
            label: 'Jump to beginning',
            disabled: sheet.story.chapters.length === 0,
            onSelect: () => {
              const id = sheet.story.id;
              setSheet(null);
              navigate(`/story/${id}/read`, { state: { jumpTo: 'start' } });
            },
          },
          {
            label: 'Jump to end',
            disabled: sheet.story.chapters.length === 0,
            onSelect: () => {
              const id = sheet.story.id;
              setSheet(null);
              navigate(`/story/${id}/read`, { state: { jumpTo: 'end' } });
            },
          },
          {
            label: 'Remove',
            destructive: true,
            onSelect: () => setSheet({ kind: 'confirmRemove', story: sheet.story }),
          },
        ]
      : sheet?.kind === 'confirmRemove'
        ? [
            {
              label: 'Remove',
              destructive: true,
              onSelect: async () => {
                const id = sheet.story.id;
                setSheet(null);
                await deleteStoryAndCover(id);
              },
            },
          ]
        : [];

  async function runExport(story: Story) {
    setExporting({ title: story.title || 'Untitled Story', stage: 'Preparing…' });
    try {
      await exportStoryToPdf(story, (stage) =>
        setExporting({ title: story.title || 'Untitled Story', stage }),
      );
    } catch (err) {
      console.error('[pdf] export failed', err);
      setExporting({ title: story.title || 'Untitled Story', stage: 'Export failed.' });
      window.setTimeout(() => setExporting(null), 2600);
      return;
    }
    setExporting(null);
  }

  return (
    <>
      <NavBar
        title="Library"
        largeTitle
        scrollRef={scrollRef}
        right={
          <NavButton label="Settings" onClick={() => navigate('/settings')}>
            <Icon name="gear" size={22} />
          </NavButton>
        }
      />

      <div className="screen" ref={scrollRef}>
        <LargeTitle>Library</LargeTitle>
        <div className="grid">
          <button
            type="button"
            className="grid__cell grid__cell--create"
            onClick={startCreate}
            aria-label="Create a new story"
          >
            <CreateTile />
          </button>

          {stories.map((story) => (
            <div className="grid__cell" key={story.id}>
              <button
                type="button"
                className="grid__cover-btn"
                onClick={() => openStory(story)}
                /* The title is no longer shown in the grid, so it lives on the
                   accessible name and as a pointer tooltip instead. */
                aria-label={`Open ${story.title}`}
                title={story.title}
              >
                <CoverTile story={story} />
              </button>

              <div className="grid__meta">
                <span className="grid__sub">{describe(story)}</span>
                <button
                  type="button"
                  className="grid__more"
                  aria-label={`More options for ${story.title}`}
                  onClick={() => setSheet({ kind: 'menu', story })}
                >
                  <Icon name="dots-three" weight="bold" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {stories.length === 0 && (
          <p className="library__empty">
            Your library is empty. Tap <strong>Create New</strong> to write your first story.
          </p>
        )}

        {import.meta.env.DEV && (
          <div className="library__dev">
            <button type="button" className="nav__btn" onClick={() => void window.__dev.seedFixtures()}>
              Reseed fixtures
            </button>
            <button type="button" className="nav__btn" onClick={() => window.__dev.clearStories()}>
              Clear all
            </button>
          </div>
        )}
      </div>

      {exporting && (
        <div className="toast" role="status">
          <span className="toast__spinner" aria-hidden="true" />
          {exporting.stage} <strong>{exporting.title}</strong>
        </div>
      )}

      {sheet && (
        <ActionSheet
          title={sheet.kind === 'confirmRemove' ? 'Remove this story?' : sheet.story.title}
          message={
            sheet.kind === 'confirmRemove'
              ? 'This deletes it from this device permanently. There is no cloud copy, and it cannot be undone.'
              : undefined
          }
          items={sheetItems}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}

/** What the regenerate item should say about itself, given the current state. */
function describe(story: Story): string {
  const written = chapterCount(story);
  if (story.status === 'finished') return `${story.totalChapters} chapters · Complete`;
  if (written === 0) return `${story.totalChapters} chapters`;
  return `Chapter ${written} of ${story.totalChapters}`;
}

