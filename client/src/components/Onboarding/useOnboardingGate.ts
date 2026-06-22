import { useOnboardingStatusQuery } from '~/data-provider';

export type OnboardingGate = {
  loading: boolean;
  gateActive: boolean;
  isCompanyScope: boolean;
};

export default function useOnboardingGate(): OnboardingGate {
  const { data, isLoading, isError } = useOnboardingStatusQuery();

  if (isLoading || isError) {
    return { loading: isLoading, gateActive: false, isCompanyScope: false };
  }

  const onboarding = data?.onboarding;
  const hasShape = !!onboarding && !!onboarding.company && !!onboarding.personal;

  if (!hasShape) {
    return { loading: false, gateActive: false, isCompanyScope: false };
  }

  const isCompanyScope = onboarding!.is_owner && !onboarding!.company.completed;
  const gateActive =
    (onboarding!.is_owner && !onboarding!.company.completed) || !onboarding!.personal.completed;

  return { loading: false, gateActive, isCompanyScope };
}
