import Icon from './Icon';
import type { ReaderMetrics } from '../reader/layout';
import type { Achievement } from '../types';

interface Props {
  achievement: Achievement | undefined;
  metrics: ReaderMetrics;
}

/**
 * A whole page inside the book, not an overlay — it is part of the story's page
 * sequence and appears in the PDF export the same way. See SPEC.md §4.6.
 *
 * Type is sized in `em` against the reader's own body size, so the description matches
 * the prose exactly and the whole page scales with the font-size setting. Spacing is
 * driven by the reader's line height for the same reason.
 */
export default function AchievementPage({ achievement, metrics }: Props) {
  if (!achievement) return null;

  return (
    <div
      className="achievement-page"
      style={{
        fontSize: `${metrics.fontSize}px`,
        ['--ach-rhythm' as string]: `${metrics.lineHeight}px`,
      }}
    >
      <Icon name="trophy" className="achievement-page__icon" />
      <p className="achievement-page__eyebrow">Achievement Unlocked</p>
      <h2 className="achievement-page__title">{achievement.title}</h2>
      <p className="achievement-page__desc">{achievement.description}</p>
    </div>
  );
}
