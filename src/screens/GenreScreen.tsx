import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import NavBar, { BackButton, LargeTitle, useScrollRef } from '../components/NavBar';
import PillGroup from '../components/PillGroup';
import { StorageFullError } from '../storage/quota';
import { createStory, updateStory } from '../storage/stories';
import { useStory } from '../storage/useStories';
import {
  AUDIENCE_PROFILE,
  AUDIENCES,
  GENRES,
  SETTINGS,
  chapterCount,
  type Audience,
  type Genre,
  type Setting,
} from '../types';

/** Sensible opening position so Confirm is reachable without any taps. */
const DEFAULTS = { audience: 'Children', genre: 'Adventure', setting: 'Fantasy' } as const;

/**
 * One screen, two modes. Creation mode (no :id) builds a new story; edit mode
 * (with :id) retunes an existing one for its remaining chapters.
 */
export default function GenreScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const story = useStory(id);
  const editing = Boolean(id);
  const scrollRef = useScrollRef();

  const [audience, setAudience] = useState<Audience>(story?.audience ?? DEFAULTS.audience);
  const [genre, setGenre] = useState<Genre>(story?.genre ?? DEFAULTS.genre);
  const [setting, setSetting] = useState<Setting>(story?.setting ?? DEFAULTS.setting);
  const [error, setError] = useState<string | null>(null);

  // An :id that matches nothing means a stale link or a story removed in another tab.
  if (editing && !story) return <Navigate to="/library" replace />;

  const written = story ? chapterCount(story) : 0;
  const started = written > 0;
  const changed =
    !story || audience !== story.audience || genre !== story.genre || setting !== story.setting;

  function confirm() {
    setError(null);
    try {
      if (!editing) {
        const created = createStory({ audience, genre, setting });
        navigate(`/story/${created.id}/read`, { replace: true });
        return;
      }

      updateStory(story!.id, () => ({
        audience,
        genre,
        setting,
        // Only flag a mid-story shift once there is a story to shift; the next
        // generation prompt uses this to write the transition rather than lurch.
        ...(started && changed ? { genreChangedAtChapter: written } : {}),
      }));
      // Navigate explicitly rather than going back: this screen can be reached by
      // deep link or reload, where history's previous entry is not this story's Read.
      navigate(`/story/${story!.id}/read`, { replace: true });
    } catch (err) {
      setError(
        err instanceof StorageFullError ? err.message : 'Could not save. Please try again.',
      );
    }
  }

  const profile = AUDIENCE_PROFILE[audience];

  return (
    <>
      <NavBar
        title="Genre"
        largeTitle
        scrollRef={scrollRef}
        left={
          <BackButton
            label={editing ? 'Read' : 'Library'}
            onClick={() =>
              editing ? navigate(`/story/${story!.id}/read`) : navigate('/library')
            }
          />
        }
      />

      <div className="screen" ref={scrollRef}>
        <LargeTitle>Genre</LargeTitle>

        <div className="genre">
          <p className="genre__intro">
            {editing
              ? 'These apply from the next chapter onward. Everything already written stays as it is.'
              : 'Choose what kind of story you’d like. This shapes the whole book.'}
          </p>

          <PillGroup
            label="Audience"
            options={AUDIENCES}
            value={audience}
            onChange={setAudience}
            hint={
              started ? (
                <>
                  Sets the tone and reading level. This book stays at{' '}
                  <strong>{story!.totalChapters} chapters</strong> — its length was fixed when
                  it began.
                </>
              ) : (
                <>
                  {audience} — {profile.label}, about {profile.wordsPerChapter} words each.
                </>
              )
            }
          />

          <PillGroup label="Genre" options={GENRES} value={genre} onChange={setGenre} />

          <PillGroup label="Setting" options={SETTINGS} value={setting} onChange={setSetting} />

          {editing && started && changed && (
            <p className="genre__warning">
              Changing direction {written} chapter{written === 1 ? '' : 's'} in can read as a
              sharp turn. The next chapter will be written to bridge it.
            </p>
          )}

          {error && (
            <p className="settings__status settings__status--error" role="status">
              {error}
            </p>
          )}
        </div>
      </div>

      <footer className="footer">
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={confirm}
          disabled={editing && !changed}
        >
          {editing ? (changed ? 'Save' : 'No changes') : 'Confirm'}
        </button>
      </footer>
    </>
  );
}
