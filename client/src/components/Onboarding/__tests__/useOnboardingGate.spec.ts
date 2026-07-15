import { renderHook } from '@testing-library/react';
import type { TOnboardingStatusResponse } from 'librechat-data-provider';
import { useOnboardingStatusQuery } from '~/data-provider';
import useOnboardingGate from '../useOnboardingGate';

jest.mock('~/data-provider', () => ({
  useOnboardingStatusQuery: jest.fn(),
}));

const mockUseOnboardingStatusQuery = useOnboardingStatusQuery as jest.Mock;

type ScopeState = { completed: boolean };
type GateOnboarding = {
  is_owner: boolean;
  company?: ScopeState | null;
  personal?: ScopeState | null;
};

const asData = (onboarding?: GateOnboarding): TOnboardingStatusResponse =>
  ({ onboarding }) as unknown as TOnboardingStatusResponse;

const setQuery = (state: {
  isLoading?: boolean;
  isError?: boolean;
  data?: TOnboardingStatusResponse;
}) => {
  mockUseOnboardingStatusQuery.mockReturnValue({
    isLoading: false,
    isError: false,
    data: undefined,
    ...state,
  });
};

describe('useOnboardingGate', () => {
  it('is inactive (and loading) while the status query is loading', () => {
    setQuery({ isLoading: true });

    const { result } = renderHook(() => useOnboardingGate());

    expect(result.current).toEqual({ loading: true, gateActive: false, isCompanyScope: false });
  });

  it('is inactive when the status query errors', () => {
    setQuery({ isError: true });

    const { result } = renderHook(() => useOnboardingGate());

    expect(result.current).toEqual({ loading: false, gateActive: false, isCompanyScope: false });
  });

  it('is inactive for a malformed payload missing the company/personal objects', () => {
    setQuery({ data: asData({ is_owner: true }) });

    const { result } = renderHook(() => useOnboardingGate());

    expect(result.current).toEqual({ loading: false, gateActive: false, isCompanyScope: false });
  });

  it('is inactive when the payload has no onboarding object at all', () => {
    setQuery({ data: asData(undefined) });

    const { result } = renderHook(() => useOnboardingGate());

    expect(result.current).toEqual({ loading: false, gateActive: false, isCompanyScope: false });
  });

  it('gates an owner with an incomplete company profile in company scope', () => {
    setQuery({
      data: asData({
        is_owner: true,
        company: { completed: false },
        personal: { completed: false },
      }),
    });

    const { result } = renderHook(() => useOnboardingGate());

    expect(result.current).toEqual({ loading: false, gateActive: true, isCompanyScope: true });
  });

  it('gates an owner with a complete company but incomplete personal profile in personal scope', () => {
    setQuery({
      data: asData({
        is_owner: true,
        company: { completed: true },
        personal: { completed: false },
      }),
    });

    const { result } = renderHook(() => useOnboardingGate());

    expect(result.current).toEqual({ loading: false, gateActive: true, isCompanyScope: false });
  });

  it('gates a member with an incomplete personal profile in personal scope', () => {
    setQuery({
      data: asData({
        is_owner: false,
        company: { completed: true },
        personal: { completed: false },
      }),
    });

    const { result } = renderHook(() => useOnboardingGate());

    expect(result.current).toEqual({ loading: false, gateActive: true, isCompanyScope: false });
  });

  it('never puts a member in company scope, even when the company is incomplete', () => {
    setQuery({
      data: asData({
        is_owner: false,
        company: { completed: false },
        personal: { completed: true },
      }),
    });

    const { result } = renderHook(() => useOnboardingGate());

    expect(result.current).toEqual({ loading: false, gateActive: false, isCompanyScope: false });
  });

  it('is inactive once both scopes are complete', () => {
    setQuery({
      data: asData({
        is_owner: true,
        company: { completed: true },
        personal: { completed: true },
      }),
    });

    const { result } = renderHook(() => useOnboardingGate());

    expect(result.current).toEqual({ loading: false, gateActive: false, isCompanyScope: false });
  });
});
