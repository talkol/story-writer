import Icon from './Icon';
import type { Achievement } from '../types';

/**
 * A whole page inside the book, not an overlay — it is part of the story's page
 * sequence and appears in the PDF export the same way. See SPEC.md §4.6.
 */
export default function AchievementPage({ achievement }: { achievement: Achievement | undefined }) {
  if (!achievement) return null;

  return (
    <div className="achievement-page">
      <Icon name="trophy" size={44} className="achievement-page__icon" />
      <p className="achievement-page__eyebrow">Achievement Unlocked</p>
      <h2 className="achievement-page__title">{achievement.title}</h2>
      <p className="achievement-page__desc">{achievement.description}</p>
    </div>
  );
}
