import React from 'react';
import { ArrowRight } from 'lucide-react';
import useSubmitMessage from '~/hooks/Messages/useSubmitMessage';
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

  const kickoff = isCompanyScope
    ? "Let's set up my company profile"
    : "Let's set up my profile";

  const steps = isCompanyScope ? COMPANY_STEPS : PERSONAL_STEPS;
  const title = isCompanyScope
    ? localize('com_onboarding_hero_title_company')
    : localize('com_onboarding_hero_title_personal');
  const subtitle = isCompanyScope
    ? localize('com_onboarding_hero_subtitle_company')
    : localize('com_onboarding_hero_subtitle_personal');

  return (
    <div className="animate-fadeIn mx-auto flex max-w-md flex-col items-center gap-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-surface-secondary text-lg font-bold tracking-tight text-text-primary shadow-sm ring-1 ring-border-light">
        360
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
        <p className="text-sm text-text-secondary">{subtitle}</p>
      </div>
      <ul className="flex w-full flex-col gap-2 text-left">
        {steps.map((key) => (
          <li key={key} className="flex items-start gap-3 text-sm text-text-secondary">
            <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-text-secondary/40" />
            <span>{localize(key)}</span>
          </li>
        ))}
      </ul>
      <Button
        variant="default"
        onClick={() => submitMessage({ text: kickoff })}
        className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
      >
        {localize('com_onboarding_start')}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
