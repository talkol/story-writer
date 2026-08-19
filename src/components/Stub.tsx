import type { ReactNode } from 'react';

/**
 * Placeholder body for screens whose real implementation lands in a later milestone.
 * Renders the live data the screen will bind to, so the routing and storage wiring is
 * verifiable now rather than on faith.
 */
export default function Stub({
  milestone,
  children,
}: {
  milestone: string;
  children: ReactNode;
}) {
  return (
    <div className="stub">
      <span className="stub__badge">{milestone}</span>
      {children}
    </div>
  );
}
