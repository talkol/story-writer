import { Navigate, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon';
import NavBar, { NavButton } from '../components/NavBar';
import Stub from '../components/Stub';
import { useStory } from '../storage/useStories';

/** Presented as a modal over Read once Milestone 7 lands; a route for now. */
export default function AchievementsScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const story = useStory(id);

  if (!story) return <Navigate to="/library" replace />;

  return (
    <>
      <NavBar
        title="Achievements"
        right={
          <NavButton label="Close" onClick={() => navigate(-1)}>
            <Icon name="x" size={20} weight="bold" />
          </NavButton>
        }
      />
      <div className="screen">
        <Stub milestone="Milestone 7 — modal list">
          {story.achievements.length === 0 ? (
            <p>No achievements yet — keep making bold choices.</p>
          ) : (
            <ul className="stub__list">
              {story.achievements.map((a) => (
                <li key={a.id}>
                  <strong>{a.title}</strong>
                  <br />
                  {a.description}
                  <br />
                  <small>Chapter {a.unlockedAtPart}</small>
                </li>
              ))}
            </ul>
          )}
        </Stub>
      </div>
    </>
  );
}
