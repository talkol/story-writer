import { Link, useNavigate } from 'react-router-dom';
import NavBar, { NavButton } from '../components/NavBar';
import Stub from '../components/Stub';
import { useStories } from '../storage/useStories';
import { proseCount } from '../types';

export default function LibraryScreen() {
  const navigate = useNavigate();
  const stories = useStories();

  return (
    <>
      <NavBar
        title="Library"
        right={
          <NavButton label="Settings" onClick={() => navigate('/settings')}>
            ⚙︎
          </NavButton>
        }
      />
      <div className="screen">
        <Stub milestone="Milestone 2 — 2-column cover grid">
          <h2>Library</h2>
          <p>
            {stories.length} stor{stories.length === 1 ? 'y' : 'ies'} in local storage.
            The real screen renders these as a two-column grid of 2:3 covers with a
            <code>…</code> menu per book.
          </p>
          <ul className="stub__list">
            <li>
              <Link to="/new">＋ Create New</Link>
            </li>
            {stories.map((story) => (
              <li key={story.id}>
                <Link to={`/story/${story.id}/read`}>
                  <strong>{story.title || 'Untitled Story'}</strong>
                  <br />
                  {story.audience} · {story.genre} · {story.setting} — part{' '}
                  {proseCount(story)} of {story.totalParts} · {story.status}
                </Link>
              </li>
            ))}
          </ul>
          {import.meta.env.DEV && (
            <p>
              <button
                type="button"
                className="nav__btn"
                onClick={() => window.__dev.seedFixtures()}
              >
                Reseed fixtures
              </button>
              <button
                type="button"
                className="nav__btn"
                onClick={() => window.__dev.clearStories()}
              >
                Clear all
              </button>
            </p>
          )}
        </Stub>
      </div>
    </>
  );
}
