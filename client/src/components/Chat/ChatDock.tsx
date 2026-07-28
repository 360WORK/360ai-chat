import React from 'react';
import { cn } from '~/utils';

export type ChatDockProps = {
  /** Accessible name for the dock's group landmark. */
  ariaLabel?: string;
  /** Extra classes for the inner card (e.g. denser padding for the pill selector). */
  className?: string;
  children: React.ReactNode;
};

/**
 * Shared wrapper for the assistant "dock" surfaces that float directly above the
 * ChatForm — the onboarding pill selector and the Acumen confirm/adjust card.
 *
 * Both docks are the same interaction pattern (the agent asks, the user answers
 * inline above the composer), so they must share one column width, gutter, and
 * card treatment. Owning that geometry here keeps them pixel-aligned with each
 * other and with the message column instead of drifting apart.
 */
function ChatDock({ ariaLabel, className, children }: ChatDockProps) {
  return (
    <div className="mx-auto mb-3 flex w-full px-2 md:max-w-3xl xl:max-w-4xl">
      <div
        role="group"
        aria-label={ariaLabel}
        className={cn(
          'w-full rounded-2xl border border-border-light bg-surface-secondary p-4',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export default ChatDock;
