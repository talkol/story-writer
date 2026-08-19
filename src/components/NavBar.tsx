import { useEffect, useRef, useState, type ReactNode } from 'react';
import Icon from './Icon';

interface Props {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
  /**
   * iOS large-title behaviour: the title renders big inside the scroll area and
   * collapses into the bar once scrolled past, with the hairline fading in.
   */
  largeTitle?: boolean;
  /** Scroll container to watch. Required when largeTitle is set. */
  scrollRef?: React.RefObject<HTMLElement | null>;
}

export default function NavBar({ title, left, right, largeTitle, scrollRef }: Props) {
  const [collapsed, setCollapsed] = useState(!largeTitle);

  useEffect(() => {
    if (!largeTitle) {
      setCollapsed(true);
      return;
    }
    const el = scrollRef?.current;
    if (!el) return;

    // Threshold sits just past the large title's baseline so the swap reads as
    // the title sliding under the bar rather than a flicker at zero.
    const onScroll = () => setCollapsed(el.scrollTop > 32);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [largeTitle, scrollRef]);

  return (
    <header className={`nav${collapsed ? ' nav--bordered' : ''}`}>
      <div className="nav__side">{left}</div>
      <h1 className={`nav__title${largeTitle ? ' nav__title--collapsing' : ''}`}>{title}</h1>
      <div className="nav__side nav__side--right">{right}</div>
    </header>
  );
}

export function NavButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button type="button" className="nav__btn" onClick={onClick} aria-label={label}>
      {children}
    </button>
  );
}

/** Standard iOS back affordance: chevron plus destination label. */
export function BackButton({ label = 'Back', onClick }: { label?: string; onClick: () => void }) {
  return (
    <button type="button" className="nav__btn" onClick={onClick} aria-label={`Back to ${label}`}>
      <Icon name="caret-left" weight="bold" />
      {label}
    </button>
  );
}

/** The large title itself, rendered as the first thing inside the scroll area. */
export function LargeTitle({ children }: { children: ReactNode }) {
  return <h2 className="large-title">{children}</h2>;
}

/** Convenience for screens that need a ref to their scroll container. */
export function useScrollRef() {
  return useRef<HTMLDivElement>(null);
}
