import React, { useCallback } from 'react';
import { ArrowRight } from 'lucide-react';
import { useOnboardingStatusQuery } from '~/data-provider';
import useSubmitMessage from '~/hooks/Messages/useSubmitMessage';
import { useLocalize } from '~/hooks';
import ConversationStarters from '~/components/Chat/Input/ConversationStarters';
import { Button } from '~/components/ui';
import useOnboardingGate from './useOnboardingGate';
import { onboardingKickoff } from './constants';
import NumberedCardList from './NumberedCardList';
import type { NumberedCardItem } from './NumberedCardList';

function OnboardingStarters() {
  const localize = useLocalize();
  const { submitMessage } = useSubmitMessage();
  const { loading, gateActive, isCompanyScope } = useOnboardingGate();
  const { data, isError } = useOnboardingStatusQuery();

  const send = useCallback((text: string) => submitMessage({ text }), [submitMessage]);

  const onboarding = data?.onboarding;
  const hasShape = !!onboarding && !!onboarding.company && !!onboarding.personal;

  if (loading || isError || !hasShape) {
    return <ConversationStarters />;
  }

  if (gateActive) {
    const description = isCompanyScope
      ? localize('com_onboarding_nudge_company')
      : localize('com_onboarding_nudge_personal');
    return (
      <div className="animate-fadeIn mb-8 mt-2 flex w-full max-w-sm flex-col items-center gap-5 px-4">
        <div className="text-center">
          <div className="text-base font-medium text-text-primary">
            {localize('com_onboarding_nudge_title')}
          </div>
          <div className="mt-1 text-sm text-text-secondary">{description}</div>
        </div>
        <Button
          variant="default"
          onClick={() => send(onboardingKickoff(isCompanyScope))}
          className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
        >
          {localize('com_onboarding_start')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const prompts = onboarding.tailored_prompts ?? [];
  if (!prompts.length) {
    return <ConversationStarters />;
  }

  const cardItems: NumberedCardItem[] = prompts
    .slice(0, 3)
    .map((label, i) => ({ id: `tp-${i}`, label }));
  return (
    <div className="animate-fadeIn mx-auto mb-4 mt-2 flex w-full max-w-3xl flex-col gap-3 px-4">
      <p className="text-sm font-medium text-text-secondary">{localize('com_onboarding_try')}</p>
      <NumberedCardList
        items={cardItems}
        onSelect={(item) => send(item.label)}
        ariaLabel={localize('com_onboarding_suggestions_label')}
        selectHint={localize('com_onboarding_pick')}
      />
    </div>
  );
}

export default React.memo(OnboardingStarters);
