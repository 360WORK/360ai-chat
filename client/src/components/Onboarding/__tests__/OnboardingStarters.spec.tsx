import React from 'react';
import { render, screen, fireEvent } from 'test/layout-test-utils';
import OnboardingStarters from '../OnboardingStarters';

const mockSubmit = jest.fn();
jest.mock('~/hooks/Messages/useSubmitMessage', () => ({
  __esModule: true,
  default: () => ({ submitMessage: mockSubmit }),
}));

const mockUseStatus = jest.fn();
jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider'),
  useOnboardingStatusQuery: (...a: unknown[]) => mockUseStatus(...a),
}));

jest.mock('~/components/Chat/Input/ConversationStarters', () => () => <div>generic-starters</div>);

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

beforeEach(() => {
  mockSubmit.mockClear();
});

it('shows the nudge when personal onboarding is incomplete', () => {
  mockUseStatus.mockReturnValue({
    data: {
      onboarding: {
        is_owner: false,
        company: { completed: true },
        personal: { completed: false },
        tailored_prompts: [],
      },
    },
    isLoading: false,
    isError: false,
  });
  render(<OnboardingStarters />);
  expect(screen.getByText('com_onboarding_nudge_title')).toBeInTheDocument();
  fireEvent.click(screen.getByText('com_onboarding_start'));
  expect(mockSubmit).toHaveBeenCalledWith({ text: expect.stringMatching(/set up my profile/i) });
});

it('shows tailored cards when complete and sends on click', () => {
  mockUseStatus.mockReturnValue({
    data: {
      onboarding: {
        is_owner: false,
        company: { completed: true },
        personal: { completed: true },
        tailored_prompts: ['Source ML engineers in Berlin'],
      },
    },
    isLoading: false,
    isError: false,
  });
  render(<OnboardingStarters />);
  fireEvent.click(screen.getByText(/Source ML engineers/));
  expect(mockSubmit).toHaveBeenCalledWith({ text: 'Source ML engineers in Berlin' });
});

it('falls back to generic starters while loading', () => {
  mockUseStatus.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  render(<OnboardingStarters />);
  expect(screen.getByText('generic-starters')).toBeInTheDocument();
});
