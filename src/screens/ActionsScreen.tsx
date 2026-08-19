import { Navigate, useNavigate, useParams } from 'react-router-dom';
import NavBar, { BackButton } from '../components/NavBar';
import Stub from '../components/Stub';
import { useStory } from '../storage/useStories';

export default function ActionsScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const story = useStory(id);

  if (!story) return <Navigate to="/library" replace />;

  return (
    <>
      <NavBar
        title="Actions"
        left={<BackButton onClick={() => navigate(-1)} />}
      />
      <div className="screen">
        <Stub milestone="Milestone 6 — four choice buttons">
          <h2>How should the plot advance?</h2>
          <ul className="stub__list">
            {story.pendingActions.map((action, i) => (
              <li key={i}>
                <a href={`#/story/${story.id}/read`}>{action}</a>
              </li>
            ))}
          </ul>
          {story.pendingActions.length === 0 && (
            <p>No pending actions — this story is generating or finished.</p>
          )}
        </Stub>
      </div>
    </>
  );
}
