import { useMemo } from 'react';
import type { TMessage } from 'librechat-data-provider';
import type { OnboardingStep } from './onboardingSchema';
import {
  extractOnboardingStepId,
  extractInlineOnboardingStep,
  getOnboardingStep,
} from './onboardingSchema';
import { getLatestAssistantText, useLatestAssistantText } from '~/utils/latestAssistantText';

export type UseCurrentOnboardingStep = {
  /** The active onboarding step to render pills for, or null when none. */
  step: OnboardingStep | null;
  /** True only while we're actively onboarding (gate active). */
  active: boolean;
};

/**
 * Detects the onboarding question the agent is currently asking, if any.
 *
 * Supports two emission formats (see onboardingSchema.ts):
 *  - Predefined step: `<!--onboarding-step:STEP_ID-->` → looked up in schema.
 *  - Inline dynamic spec: a fenced `onboarding` JSON block → parsed directly.
 *
 * The inline format is checked first (it's the more specific signal), then the
 * predefined-step marker.
 *
 * @param gateActive whether onboarding is currently in progress (from useOnboardingGate)
 * @param messagesTree the current conversation message tree
 */
export default function useCurrentOnboardingStep(
  gateActive: boolean,
  messagesTree: TMessage[] | null | undefined,
): UseCurrentOnboardingStep {
  const text = useLatestAssistantText(messagesTree);
  return useMemo(() => {
    if (!gateActive) {
      return { step: null, active: false };
    }
    if (!text) {
      return { step: null, active: true };
    }
    // Inline (dynamic) question first — more specific.
    const inline = extractInlineOnboardingStep(text);
    if (inline) {
      return { step: inline, active: true };
    }
    // Predefined step reference.
    const id = extractOnboardingStepId(text);
    if (id) {
      const step = getOnboardingStep(id);
      if (step) {
        return { step, active: true };
      }
    }
    return { step: null, active: true };
  }, [gateActive, text]);
}

/** Test-only re-export of the shared tree walker (see ~/utils/latestAssistantText). */
export { getLatestAssistantText };
