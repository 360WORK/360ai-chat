import React from 'react';
import { useLocalize } from '~/hooks';
import useSubmitMessage from '~/hooks/Messages/useSubmitMessage';
import type { AcumenConfirmFrame } from './confirmSchema';

export type AcumenConfirmDockProps = {
  /** The active confirm frame, or null when none is pending. */
  frame: AcumenConfirmFrame | null;
  /** Disable submit (e.g. while the agent is responding). */
  submitting?: boolean;
};

/**
 * Renders the Acumen mid-point confirmation dock: the frame the agent paused on
 * plus Confirm / Adjust buttons. Clicking either sends the user's choice as a
 * message (the resolver then hides the dock because the user's reply becomes the
 * branch leaf). Self-hides when `frame` is null.
 *
 * The outer wrapper matches the ChatForm column (`md:max-w-3xl xl:max-w-4xl`,
 * centered, `sm:px-2`) so the card stays inside the chat width and aligns with
 * the input instead of spanning the full viewport.
 *
 * MUST be rendered inside the `ChatFormProvider` / `CustomFormContext` tree
 * (same constraint as OnboardingPillDock) because `useSubmitMessage` depends on
 * that context.
 */
function AcumenConfirmDock({ frame, submitting = false }: AcumenConfirmDockProps) {
  const localize = useLocalize();
  const { submitMessage } = useSubmitMessage();

  if (!frame) {
    return null;
  }

  const confirmLabel = frame.confirmLabel || localize('com_acumen_confirm_confirm');
  const adjustLabel = frame.adjustLabel || localize('com_acumen_confirm_adjust');

  return (
    <div className="mx-auto mb-3 flex w-full sm:px-2 md:max-w-3xl xl:max-w-4xl">
      <div
        role="group"
        aria-label={localize('com_acumen_confirm_aria')}
        className="w-full rounded-2xl border border-border-light bg-surface-secondary p-4"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
          {localize('com_acumen_confirm_lead')}
        </p>
        <p className="mt-1.5 text-base font-semibold text-text-primary">{frame.title}</p>
        {frame.summary ? (
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-text-secondary">
            {frame.summary}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label={confirmLabel}
            disabled={submitting}
            onClick={() => submitMessage({ text: localize('com_acumen_confirm_confirmed') })}
            className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            aria-label={adjustLabel}
            disabled={submitting}
            onClick={() => submitMessage({ text: localize('com_acumen_confirm_adjust_reply') })}
            className="inline-flex items-center gap-1.5 rounded-full border border-border-light bg-surface-primary px-4 py-1.5 text-sm font-medium text-text-secondary transition hover:border-border-medium hover:bg-surface-tertiary hover:text-text-primary disabled:opacity-50"
          >
            {adjustLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(AcumenConfirmDock);
