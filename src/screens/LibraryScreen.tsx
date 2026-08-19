import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ActionSheet, { type SheetItem } from '../components/ActionSheet';
import CoverTile, { CreateTile } from '../components/CoverTile';
import Icon from '../components/Icon';
import NavBar, { LargeTitle, NavButton, useScrollRef } from '../components/NavBar';
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

