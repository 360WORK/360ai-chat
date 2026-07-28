/* Onboarding */
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type {
  TOnboardingStatusResponse,
  TUpdateOnboardingProfileParams,
  TUpdateOnboardingProfileResponse,
} from 'librechat-data-provider';
import type {
  UseQueryOptions,
  UseMutationOptions,
  QueryObserverResult,
} from '@tanstack/react-query';

export const useOnboardingStatusQuery = (
  config?: UseQueryOptions<TOnboardingStatusResponse>,
): QueryObserverResult<TOnboardingStatusResponse> => {
  return useQuery<TOnboardingStatusResponse>(
    [QueryKeys.onboardingStatus],
    () => dataService.getOnboardingStatus(),
    {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
      ...config,
    },
  );
};

export const useUpdateOnboardingProfileMutation = (
  options?: UseMutationOptions<
    TUpdateOnboardingProfileResponse,
    Error,
    TUpdateOnboardingProfileParams
  >,
) => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: TUpdateOnboardingProfileParams) => dataService.updateOnboardingProfile(payload),
    {
      ...options,
      onSuccess: (...params) => {
        queryClient.invalidateQueries([QueryKeys.onboardingStatus]);
        options?.onSuccess?.(...params);
      },
    },
  );
};
