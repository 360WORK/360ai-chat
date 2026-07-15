import { render, screen } from 'test/layout-test-utils';
import { fireEvent } from '@testing-library/react';
import AcumenWorkspaces from '../AcumenWorkspaces';

const mockSubmitMessage = jest.fn();
jest.mock('~/hooks/Messages/useSubmitMessage', () => ({
  __esModule: true,
  default: () => ({ submitMessage: mockSubmitMessage }),
}));
jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));

const mockUseWorkspaces = jest.fn();
jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider'),
  useAcumenWorkspacesQuery: () => mockUseWorkspaces(),
}));

describe('AcumenWorkspaces', () => {
  beforeEach(() => {
    mockSubmitMessage.mockClear();
    mockUseWorkspaces.mockReturnValue({
      data: { businessType: 'rec2rec', workspaces: [] },
      isLoading: false,
    });
  });

  it('renders the four curated workspace cards for a known business type', () => {
    render(<AcumenWorkspaces />);
    expect(screen.getByText('com_acumen_card_talent_label')).toBeInTheDocument();
    expect(screen.getByText('com_acumen_card_signal_label')).toBeInTheDocument();
    expect(screen.getByText('com_acumen_card_market_label')).toBeInTheDocument();
    expect(screen.getByText('com_acumen_card_research_label')).toBeInTheDocument();
  });

  it('applies rec2rec description overrides', () => {
    render(<AcumenWorkspaces />);
    expect(screen.getByText('com_acumen_card_talent_desc_rec2rec')).toBeInTheDocument();
  });

  it('sends the use-case kickoff text on click', () => {
    render(<AcumenWorkspaces />);
    fireEvent.click(screen.getByText('com_acumen_card_market_label'));
    expect(mockSubmitMessage).toHaveBeenCalledWith({
      text: 'Map the market for a sector I want to understand.',
    });
  });

  it('renders nothing when there is no business type', () => {
    const { container } = render(<AcumenWorkspaces businessTypeOverride={null} />);
    expect(container.firstChild).toBeNull();
  });
});
