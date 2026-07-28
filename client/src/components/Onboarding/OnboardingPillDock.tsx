import React, { useEffect, useRef } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalize } from '~/hooks';
import ChatDock from '~/components/Chat/ChatDock';
import useSubmitMessage from '~/hooks/Messages/useSubmitMessage';
import PillOptions from './PillOptions';
import type { OnboardingStep } from './onboardingSchema';

export type OnboardingPillDockProps = {
  /** The active onboarding step, or null when no question is pending. */
  step: OnboardingStep | null;
  /** Disable submit (e.g. while the agent is responding). */
  submitting?: boolean;
};

/**
 * Renders the onboarding pill selector for the active step, if any.
 *
 * MUST be rendered inside the `ChatFormProvider` / `CustomFormContext` tree,
 * because `useSubmitMessage` depends on that context. `ChatView` renders this
 * within its provider subtree; calling `useSubmitMessage` directly in
 * `ChatView`'s body throws because the context is only established by the
 * providers in the returned JSX.
 */
function OnboardingPillDock({ step, submitting = false }: OnboardingPillDockProps) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { submitMessage } = useSubmitMessage();
  const stepId = step?.id ?? null;
  const previousStepId = useRef(stepId);

  useEffect(() => {
    if (previousStepId.current === stepId) {
      return;
    }
    previousStepId.current = stepId;
    queryClient.invalidateQueries([QueryKeys.onboardingStatus]);
  }, [stepId, queryClient]);

  if (!step) {
    return null;
  }
  return (
    <ChatDock ariaLabel={localize('com_onboarding_pills_aria')}>
      <PillOptions
        step={step}
        onSubmit={(text) => submitMessage({ text })}
        submitting={submitting}
      />
    </ChatDock>
  );
}

export default React.memo(OnboardingPillDock);
