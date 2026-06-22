import React from 'react';
import { render, screen } from 'test/layout-test-utils';
import { fireEvent } from '@testing-library/react';
import WorkspaceProfile from '../WorkspaceProfile';

const mockMutate = jest.fn();
const mockUseStatus = jest.fn();

jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider'),
  useOnboardingStatusQuery: () => mockUseStatus(),
  useUpdateOnboardingProfileMutation: () => ({ mutate: mockMutate, isLoading: false }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (k: string) => k,
}));

beforeEach(() => {
  jest.clearAllMocks();
});

const memberStatus = {
  data: {
    onboarding: {
      is_owner: false,
      role: 'member' as const,
      client: { id: 1, name: 'Acme' },
      company: { completed: true, profile: { industry: 'Tech' } },
      personal: { completed: true, profile: { desk: 'AI startups' } },
      tailored_prompts: [],
    },
  },
  isLoading: false,
  isError: false,
};

const ownerStatus = {
  data: {
    onboarding: {
      is_owner: true,
      role: 'owner' as const,
      client: { id: 1, name: 'Acme' },
      company: { completed: true, profile: { industry: 'SaaS', tooling: ['Greenhouse'] } },
      personal: { completed: true, profile: { desk: 'Agency desk', role: 'Senior recruiter' } },
      tailored_prompts: [],
    },
  },
  isLoading: false,
  isError: false,
};

describe('WorkspaceProfile', () => {
  it('member sees only the personal section and not the company section', () => {
    mockUseStatus.mockReturnValue(memberStatus);
    render(<WorkspaceProfile />);

    expect(screen.queryByText('com_onboarding_company_section')).not.toBeInTheDocument();
    expect(screen.getByText('com_onboarding_personal_section')).toBeInTheDocument();
  });

  it('owner sees both company and personal sections', () => {
    mockUseStatus.mockReturnValue(ownerStatus);
    render(<WorkspaceProfile />);

    expect(screen.getByText('com_onboarding_company_section')).toBeInTheDocument();
    expect(screen.getByText('com_onboarding_personal_section')).toBeInTheDocument();
  });

  it('member editing a personal field and saving calls mutate with scope=personal and updated profile', () => {
    mockUseStatus.mockReturnValue(memberStatus);
    render(<WorkspaceProfile />);

    const deskInput = screen.getByDisplayValue('AI startups');
    fireEvent.change(deskInput, { target: { value: 'AI scaleups' } });

    fireEvent.click(screen.getByText('com_onboarding_save'));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'personal',
        profile: expect.objectContaining({ desk: 'AI scaleups' }),
      }),
    );
  });

  it('owner editing a company field and saving calls mutate with scope=company and updated profile', () => {
    mockUseStatus.mockReturnValue(ownerStatus);
    render(<WorkspaceProfile />);

    const industryInput = screen.getByDisplayValue('SaaS');
    fireEvent.change(industryInput, { target: { value: 'Fintech' } });

    const saveButtons = screen.getAllByText('com_onboarding_save');
    fireEvent.click(saveButtons[0]);

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'company',
        profile: expect.objectContaining({ industry: 'Fintech' }),
      }),
    );
  });

  it('array fields are split on save', () => {
    mockUseStatus.mockReturnValue(ownerStatus);
    render(<WorkspaceProfile />);

    const toolingInput = screen.getByDisplayValue('Greenhouse');
    fireEvent.change(toolingInput, { target: { value: 'Greenhouse, Lever' } });

    const saveButtons = screen.getAllByText('com_onboarding_save');
    fireEvent.click(saveButtons[0]);

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'company',
        profile: expect.objectContaining({ tooling: ['Greenhouse', 'Lever'] }),
      }),
    );
  });

  it('shows loading state', () => {
    mockUseStatus.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<WorkspaceProfile />);
    expect(screen.getByText('com_onboarding_loading')).toBeInTheDocument();
  });

  it('shows empty state when both profiles are null', () => {
    mockUseStatus.mockReturnValue({
      data: {
        onboarding: {
          is_owner: false,
          role: 'member' as const,
          client: null,
          company: { completed: false, profile: null },
          personal: { completed: false, profile: null },
          tailored_prompts: [],
        },
      },
      isLoading: false,
      isError: false,
    });
    render(<WorkspaceProfile />);
    expect(screen.getByText('com_onboarding_empty')).toBeInTheDocument();
  });
});
