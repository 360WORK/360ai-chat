import React from 'react';
import { render, screen, fireEvent } from 'test/layout-test-utils';
import OnboardingHero from '../OnboardingHero';

const mockSubmit = jest.fn();
jest.mock('~/hooks/Messages/useSubmitMessage', () => ({
  __esModule: true,
  default: () => ({ submitMessage: mockSubmit }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/components/ui', () => ({
  Button: ({ children, onClick, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button onClick={onClick} {...rest}>{children}</button>
  ),
}));

beforeEach(() => {
  mockSubmit.mockClear();
});

it('renders the company-scope title when isCompanyScope=true', () => {
  render(<OnboardingHero isCompanyScope={true} />);
  expect(screen.getByText('com_onboarding_hero_title_company')).toBeInTheDocument();
});

it('renders the personal-scope title when isCompanyScope=false', () => {
  render(<OnboardingHero isCompanyScope={false} />);
  expect(screen.getByText('com_onboarding_hero_title_personal')).toBeInTheDocument();
});

it('calls submitMessage with company kickoff when isCompanyScope=true', () => {
  render(<OnboardingHero isCompanyScope={true} />);
  fireEvent.click(screen.getByText('com_onboarding_start'));
  expect(mockSubmit).toHaveBeenCalledWith({ text: "Let's set up my company profile" });
});

it('calls submitMessage with personal kickoff when isCompanyScope=false', () => {
  render(<OnboardingHero isCompanyScope={false} />);
  fireEvent.click(screen.getByText('com_onboarding_start'));
  expect(mockSubmit).toHaveBeenCalledWith({ text: "Let's set up my profile" });
});

it('renders company step keys when isCompanyScope=true', () => {
  render(<OnboardingHero isCompanyScope={true} />);
  expect(screen.getByText('com_onboarding_hero_step1_company')).toBeInTheDocument();
  expect(screen.getByText('com_onboarding_hero_step2_company')).toBeInTheDocument();
  expect(screen.getByText('com_onboarding_hero_step3_company')).toBeInTheDocument();
});

it('renders personal step keys when isCompanyScope=false', () => {
  render(<OnboardingHero isCompanyScope={false} />);
  expect(screen.getByText('com_onboarding_hero_step1_personal')).toBeInTheDocument();
  expect(screen.getByText('com_onboarding_hero_step2_personal')).toBeInTheDocument();
  expect(screen.getByText('com_onboarding_hero_step3_personal')).toBeInTheDocument();
});
