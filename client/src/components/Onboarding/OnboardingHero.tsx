import React from 'react';
import { ArrowRight } from 'lucide-react';
import useSubmitMessage from '~/hooks/Messages/useSubmitMessage';
import { onboardingKickoff } from './constants';
import { useLocalize } from '~/hooks';
import { Button } from '~/components/ui';

const COMPANY_STEPS = [
  'com_onboarding_hero_step1_company',
  'com_onboarding_hero_step2_company',
  'com_onboarding_hero_step3_company',
] as const;

const PERSONAL_STEPS = [
  'com_onboarding_hero_step1_personal',
  'com_onboarding_hero_step2_personal',
  'com_onboarding_hero_step3_personal',
] as const;

type Props = {
  isCompanyScope: boolean;
};

export default function OnboardingHero({ isCompanyScope }: Props) {
  const localize = useLocalize();
  const { submitMessage } = useSubmitMessage();

  const kickoff = onboardingKickoff(isCompanyScope);

  const steps = isCompanyScope ? COMPANY_STEPS : PERSONAL_STEPS;
  const title = isCompanyScope
    ? localize('com_onboarding_hero_title_company')
    : localize('com_onboarding_hero_title_personal');
  const subtitle = isCompanyScope
    ? localize('com_onboarding_hero_subtitle_company')
    : localize('com_onboarding_hero_subtitle_personal');

  return (
    <div className="animate-fadeIn mx-auto flex w-full max-w-md flex-col px-4">
      <div className="flex flex-col items-center text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-surface-secondary">
          <img src="/assets/360-mark.png" alt="360AI" className="size-8 object-contain" />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-text-primary">{title}</h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">{subtitle}</p>
      </div>
      <ul className="mt-8 divide-y divide-border-light border-y border-border-light">
        {steps.map((key, i) => (
          <li key={key} className="flex items-center gap-4 py-3.5">
            <span className="w-5 shrink-0 text-xs font-medium tabular-nums text-text-tertiary">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="text-sm text-text-primary">{localize(key)}</span>
          </li>
        ))}
      </ul>
      <Button
        variant="default"
        onClick={() => submitMessage({ text: kickoff })}
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-medium transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
      >
        {localize('com_onboarding_start')}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
