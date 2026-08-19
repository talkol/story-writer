import type { ReactNode } from 'react';

interface Props {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
}

/** The shared top bar. Every screen in the spec has a title; some add buttons. */
export default function NavBar({ title, left, right }: Props) {
  return (
    <header className="nav">
      <div className="nav__side">{left}</div>
      <h1 className="nav__title">{title}</h1>
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
