import { render, screen } from 'test/layout-test-utils';
import AcumenLensChip from '../AcumenLensChip';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));

const mockUseAcumenActive = jest.fn();
jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider'),
  useAcumenActiveQuery: (...args: unknown[]) => mockUseAcumenActive(...args),
}));

describe('AcumenLensChip', () => {
  beforeEach(() => {
    mockUseAcumenActive.mockReset();
  });

  it('renders nothing when useCaseId is null', () => {
    mockUseAcumenActive.mockReturnValue({
      data: { businessType: 'recruitment-agencies', useCaseId: null },
    });
    const { container } = render(<AcumenLensChip conversationId="convo-1" lastMessageId="msg-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when there is no data yet', () => {
    mockUseAcumenActive.mockReturnValue({ data: undefined });
    const { container } = render(<AcumenLensChip conversationId="convo-1" lastMessageId="msg-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the combined use-case + business-type label when useCaseId is set', () => {
    mockUseAcumenActive.mockReturnValue({
      data: { businessType: 'recruitment-agencies', useCaseId: 'talent-mapping' },
    });
    render(<AcumenLensChip conversationId="convo-1" lastMessageId="msg-1" />);
    expect(screen.getByText('Talent Mapping · Recruitment Agencies')).toBeInTheDocument();
  });

  it('has an aria-label sourced from the localization key', () => {
    mockUseAcumenActive.mockReturnValue({
      data: { businessType: 'recruitment-agencies', useCaseId: 'talent-mapping' },
    });
    render(<AcumenLensChip conversationId="convo-1" lastMessageId="msg-1" />);
    expect(screen.getByLabelText('com_acumen_active_lens')).toBeInTheDocument();
  });
});
