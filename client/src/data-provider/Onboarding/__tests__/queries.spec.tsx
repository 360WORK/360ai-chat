import { createElement } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { TOnboardingStatusResponse } from 'librechat-data-provider';
import { useOnboardingStatusQuery } from '../queries';

const mockGetOnboardingStatus = jest.fn();

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getOnboardingStatus: (...args: unknown[]) => mockGetOnboardingStatus(...args),
    },
  };
});

const fixedPayload: TOnboardingStatusResponse = {
  onboarding: {
    is_owner: true,
    role: 'owner',
    client: { id: 'client-1', name: 'Acme Corp' },
    company: { completed: true, profile: { industry: 'tech' } },
    personal: { completed: false, profile: null },
    tailored_prompts: ['Help me hire a senior engineer'],
  },
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  mockGetOnboardingStatus.mockReset();
});

describe('useOnboardingStatusQuery', () => {
  it('returns the onboarding status payload from dataService.getOnboardingStatus', async () => {
    mockGetOnboardingStatus.mockResolvedValueOnce(fixedPayload);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result, unmount } = renderHook(() => useOnboardingStatusQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(fixedPayload);
    expect(mockGetOnboardingStatus).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('uses QueryKeys.onboardingStatus as the query key', async () => {
    mockGetOnboardingStatus.mockResolvedValueOnce(fixedPayload);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { unmount } = renderHook(() => useOnboardingStatusQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(
        queryClient.getQueryData<TOnboardingStatusResponse>([QueryKeys.onboardingStatus]),
      ).toEqual(fixedPayload),
    );

    unmount();
  });

  it('forwards config options to useQuery', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result, unmount } = renderHook(
      () => useOnboardingStatusQuery({ enabled: false }),
      { wrapper: createWrapper(queryClient) },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetOnboardingStatus).not.toHaveBeenCalled();

    unmount();
  });
});
