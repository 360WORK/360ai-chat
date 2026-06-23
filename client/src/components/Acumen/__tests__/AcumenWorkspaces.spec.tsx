import { render, screen } from 'test/layout-test-utils';
import { fireEvent } from '@testing-library/react';
import AcumenWorkspaces from '../AcumenWorkspaces';

const mockSubmitMessage = jest.fn();
jest.mock('~/hooks/Messages/useSubmitMessage', () => ({
  __esModule: true,
  default: () => ({ submitMessage: mockSubmitMessage }),
}));
jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider'),
  useAcumenWorkspacesQuery: () => ({
    data: {
      businessType: 'executive-search',
      workspaces: [
        { useCaseId: 'talent-mapping', label: 'Talent Mapping', kickoff: 'Map the talent' },
        { useCaseId: 'prospecting', label: 'Prospecting', kickoff: 'Build a prospect list' },
      ],
    },
    isLoading: false,
  }),
}));

describe('AcumenWorkspaces', () => {
  beforeEach(() => mockSubmitMessage.mockClear());

  it('renders a card per workspace', () => {
    render(<AcumenWorkspaces />);
    expect(screen.getByText('Talent Mapping')).toBeInTheDocument();
    expect(screen.getByText('Prospecting')).toBeInTheDocument();
  });

  it('sends the kickoff text on click', () => {
    render(<AcumenWorkspaces />);
    fireEvent.click(screen.getByText('Talent Mapping'));
    expect(mockSubmitMessage).toHaveBeenCalledWith({ text: 'Map the talent' });
  });

  it('renders nothing when there are no workspaces', () => {
    jest.resetModules();
    const { container } = render(<AcumenWorkspaces workspacesOverride={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
