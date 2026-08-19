import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ActionSheet, { type SheetItem } from '../components/ActionSheet';
import CoverTile, { CreateTile } from '../components/CoverTile';
import NavBar, { NavButton } from '../components/NavBar';
import { deleteStoryAndCover } from '../storage/library';
import { hasApiKey } from '../storage/settings';
import { useStories } from '../storage/useStories';
import { proseCount, type Story } from '../types';

type Sheet =
  | { kind: 'menu'; story: Story }
  | { kind: 'confirmRemove'; story: Story }
  | null;

export default function LibraryScreen() {
  const navigate = useNavigate();
  const stories = useStories();
  const [sheet, setSheet] = useState<Sheet>(null);

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
            disabled: true,
            note: 'Coming in a later milestone',
            onSelect: () => {},
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

  return (
    <>
      <NavBar
        title="Library"
        right={
          <NavButton label="Settings" onClick={() => navigate('/settings')}>
            <GearIcon />
          </NavButton>
        }
      />

      <div className="screen">
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
                aria-label={`Open ${story.title || 'Untitled Story'}`}
              >
                <CoverTile story={story} />
              </button>

              <div className="grid__meta">
                <div className="grid__text">
                  <span className="grid__title">{story.title || 'Untitled Story'}</span>
                  <span className="grid__sub">{describe(story)}</span>
                </div>
                <button
                  type="button"
                  className="grid__more"
                  aria-label={`More options for ${story.title || 'Untitled Story'}`}
                  onClick={() => setSheet({ kind: 'menu', story })}
                >
                  …
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

      {sheet && (
        <ActionSheet
          title={sheet.kind === 'confirmRemove' ? 'Remove this story?' : sheet.story.title || 'Untitled Story'}
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

function describe(story: Story): string {
  if (story.status === 'finished') return `${story.genre} · Complete`;
  const written = proseCount(story);
  if (written === 0) return `${story.genre} · Not started`;
  return `${story.genre} · Part ${written} of ${story.totalParts}`;
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 2.2v1.9M10 15.9v1.9M17.8 10h-1.9M4.1 10H2.2M15.5 4.5l-1.3 1.3M5.8 14.2l-1.3 1.3M15.5 15.5l-1.3-1.3M5.8 5.8L4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
