import { useNavigate, useParams } from 'react-router-dom';
import NavBar, { BackButton } from '../components/NavBar';
import Stub from '../components/Stub';
import { useStory } from '../storage/useStories';
import { AUDIENCE_PROFILE, AUDIENCES, GENRES, SETTINGS } from '../types';

/** Creation mode when there is no :id in the route; edit mode when there is. */
export default function GenreScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const story = useStory(id);
  const editing = Boolean(id);

  return (
    <>
      <NavBar
        title="Genre"
        left={<BackButton onClick={() => navigate(-1)} />}
      />
      <div className="screen">
        <Stub milestone="Milestone 3 — pill selectors + Confirm">
          <h2>{editing ? 'Edit mode' : 'Creation mode'}</h2>
          <p>
            {editing
              ? `Editing “${story?.title || 'Untitled Story'}”. Changes apply to future chapters only; totalParts stays at ${story?.totalParts}.`
              : 'Choose what kind of story you’d like. This shapes the whole book.'}
          </p>
          <p>
            <strong>Audience</strong> ({AUDIENCES.length}):{' '}
            {AUDIENCES.map((a) => `${a} — ${AUDIENCE_PROFILE[a].label}`).join(' · ')}
          </p>
          <p>
            <strong>Genre</strong> ({GENRES.length}): {GENRES.join(' · ')}
          </p>
          <p>
            <strong>Setting</strong> ({SETTINGS.length}): {SETTINGS.join(' · ')}
          </p>
        </Stub>
      </div>
    </>
  );
}
