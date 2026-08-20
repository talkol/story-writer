import { useEffect, useRef } from 'react';
import Icon from './Icon';
import type { Achievement } from '../types';

interface Props {
  achievements: Achievement[];
  totalChapters: number;
  onClose: () => void;
}

/**
 * The achievements a reader has unlocked in this story. A modal over the book rather
 * than a screen of its own, so closing it returns them to exactly the page they were
 * on — see SPEC.md §4.5.
 */
export default function AchievementsSheet({ achievements, totalChapters, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div
        className="modal"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="achievements-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__bar">
          <h2 className="modal__title" id="achievements-title">
            Achievements
          </h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} weight="bold" />
          </button>
        </header>

        <div className="modal__body">
          {achievements.length === 0 ? (
            <div className="ach-empty">
              <Icon name="trophy" size={34} className="ach-empty__icon" />
              <p>No achievements yet — keep making bold choices.</p>
            </div>
          ) : (
            <>
              <p className="ach-count">
                {achievements.length} unlocked in this story
              </p>
              <ul className="ach-list">
                {achievements.map((a) => (
                  <li className="ach" key={a.id}>
                    <Icon name="trophy" size={19} className="ach__icon" />
                    <div className="ach__text">
                      <p className="ach__title">{a.title}</p>
                      <p className="ach__desc">{a.description}</p>
                      <p className="ach__where">
                        Chapter {a.unlockedAtChapter} of {totalChapters}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
