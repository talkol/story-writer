import { Navigate, useNavigate, useParams } from 'react-router-dom';
import NavBar, { BackButton, LargeTitle, useScrollRef } from '../components/NavBar';
import { readerType } from '../reader/layout';
import { loadSettings } from '../storage/settings';
import { useStory } from '../storage/useStories';
import { chapterCount } from '../types';

export default function ActionsScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const story = useStory(id);
  const scrollRef = useScrollRef();
  // The choices are story text, so they are set at the book's own size.
  const type = readerType(loadSettings().fontScale);

  if (!story) return <Navigate to="/library" replace />;

  // Nothing to choose between — the story is finished, generating, or awaiting repair.
  if (story.pendingActions.length === 0) {
    return <Navigate to={`/story/${story.id}/read`} replace />;
  }

  const next = chapterCount(story) + 1;

  function choose(action: string) {
    // The choice travels in history state rather than the store: it is only meaningful
    // for the request about to be made. It carries the chapter count at the moment of
    // choosing, which the reader uses as a nonce — once a chapter commits, the count
    // no longer matches and the choice can never fire again.
    navigate(`/story/${story!.id}/read`, {
      replace: true,
      state: { chosenAction: action, afterChapters: story!.chapters.length },
    });
  }

  return (
    <>
      <NavBar
        title="Actions"
        largeTitle
        scrollRef={scrollRef}
        left={<BackButton label="Read" onClick={() => navigate(`/story/${story.id}/read`)} />}
      />

      <div className="screen" ref={scrollRef}>
        <LargeTitle>Actions</LargeTitle>
        <div className="actions">
          <p className="actions__intro">
            {next > story.totalChapters
              ? 'Choose how the story ends.'
              : `What happens next? Your choice shapes chapter ${next} of ${story.totalChapters}.`}
          </p>

          <ul className="actions__list">
            {story.pendingActions.map((action, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="action"
                  style={{ fontSize: `${type.fontSize}px`, lineHeight: `${type.lineHeight}px` }}
                  onClick={() => choose(action)}
                >
                  <span className="action__index" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="action__text">{action}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
