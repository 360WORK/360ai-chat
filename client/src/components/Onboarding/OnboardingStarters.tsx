import React, { useCallback, useMemo } from 'react';
import { useOnboardingStatusQuery } from '~/data-provider';
import useSubmitMessage from '~/hooks/Messages/useSubmitMessage';
import { useLocalize } from '~/hooks';
import ConversationStarters from '~/components/Chat/Input/ConversationStarters';
import NumberedCardList from './NumberedCardList';
import type { NumberedCardItem } from './NumberedCardList';

function OnboardingStarters() {
  const localize = useLocalize();
  const { submitMessage } = useSubmitMessage();
  const { data, isLoading, isError } = useOnboardingStatusQuery();

  const send = useCallback((text: string) => submitMessage({ text }), [submitMessage]);

  const onboarding = data?.onboarding;
  const hasShape = !!onboarding && !!onboarding.company && !!onboarding.personal;

  const incomplete = useMemo(() => {
    if (!hasShape) {
      return false;
    }
    return (onboarding!.is_owner && !onboarding!.company.completed) || !onboarding!.personal.completed;
  }, [hasShape, onboarding]);

  if (isLoading || isError || !hasShape) {
    return <ConversationStarters />;
  }

  if (incomplete) {
    const isCompanyScope = onboarding!.is_owner && !onboarding!.company.completed;
    const description = isCompanyScope
      ? localize('com_onboarding_nudge_company')
      : localize('com_onboarding_nudge_personal');
    const kickoff = isCompanyScope ? "Let's set up my company profile" : "Let's set up my profile";
    const items: NumberedCardItem[] = [{ id: 'start', label: localize('com_onboarding_start') }];
    return (
      <div className="mb-8 mt-2 flex w-full max-w-2xl flex-col gap-3 px-4">
        <div className="text-center">
          <div className="text-base font-medium text-text-primary">
            {localize('com_onboarding_nudge_title')}
          </div>
          <div className="mt-1 text-sm text-text-secondary">{description}</div>
        </div>
        <NumberedCardList
          items={items}
          onSelect={() => send(kickoff)}
          ariaLabel={localize('com_onboarding_nudge_title')}
        />
      </div>
    );
  }

  const prompts = onboarding!.tailored_prompts ?? [];
  if (!prompts.length) {
    return <ConversationStarters />;
  }

  const cardItems: NumberedCardItem[] = prompts.map((label, i) => ({ id: `tp-${i}`, label }));
  return (
    <div className="mb-8 mt-2 flex w-full max-w-2xl flex-col gap-2 px-4">
      <NumberedCardList
        items={cardItems}
        onSelect={(item) => send(item.label)}
        ariaLabel={localize('com_onboarding_suggestions_label')}
      />
    </div>
  );
}

export default React.memo(OnboardingStarters);
