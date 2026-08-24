import { useEffect, useRef } from 'react';

export interface SheetItem {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface Props {
  title?: string;
  message?: string;
  items: SheetItem[];
  onClose: () => void;
}

/**
 * Bottom action sheet. Chosen over an anchored popover because the library is
 * touch-first: a sheet needs no positioning math, keeps targets large, and behaves
 * the same on a phone and an iPad.
 */
export default function ActionSheet({ title, message, items, onClose }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    // Move focus into the sheet so keyboard and screen-reader users land inside it.
    sheetRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet__backdrop" onClick={onClose}>
      <div
        className="sheet"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'Actions'}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header lives inside the first group: iOS draws the title on the same
            rounded card as the actions, not floating above it. */}
        <div className="sheet__group">
          {(title || message) && (
            <div className="sheet__header">
              {title && <p className="sheet__title">{title}</p>}
              {message && <p className="sheet__message">{message}</p>}
            </div>
          )}
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`sheet__item${item.destructive ? ' sheet__item--destructive' : ''}`}
              disabled={item.disabled}
              onClick={item.onSelect}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="sheet__group">
          <button type="button" className="sheet__item sheet__item--cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
