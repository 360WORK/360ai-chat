import { render, screen } from 'test/layout-test-utils';
import { fireEvent } from '@testing-library/react';
import AcumenConfirmDock from '../AcumenConfirmDock';
import type { AcumenConfirmFrame } from '../confirmSchema';

const mockSubmitMessage = jest.fn();
jest.mock('~/hooks/Messages/useSubmitMessage', () => ({
  __esModule: true,
  default: () => ({ submitMessage: mockSubmitMessage }),
}));
jest.mock('~/hooks', () => ({
  __esModule: true,
  useLocalize: () => (key: string) => key,
}));

const frame: AcumenConfirmFrame = {
  id: 'cfo-frame',
  title: 'Run the longlist search',
  summary: 'CFO, PE-backed fintech, EMEA, £250k+.',
};

describe('AcumenConfirmDock', () => {
  beforeEach(() => mockSubmitMessage.mockClear());

  it('renders nothing when there is no frame', () => {
    const { container } = render(<AcumenConfirmDock frame={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the frame title and summary', () => {
    render(<AcumenConfirmDock frame={frame} />);
    expect(screen.getByText('Run the longlist search')).toBeInTheDocument();
    expect(screen.getByText(/PE-backed fintech/)).toBeInTheDocument();
  });

  it('uses frame-provided labels when present', () => {
    render(<AcumenConfirmDock frame={{ ...frame, confirmLabel: 'Go', adjustLabel: 'Tweak' }} />);
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tweak' })).toBeInTheDocument();
  });

  it('falls back to localized labels when the frame omits them', () => {
    render(<AcumenConfirmDock frame={frame} />);
    expect(screen.getByRole('button', { name: 'com_acumen_confirm_confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_acumen_confirm_adjust' })).toBeInTheDocument();
  });

  it('Confirm submits the confirmed reply', () => {
    render(<AcumenConfirmDock frame={frame} />);
    fireEvent.click(screen.getByRole('button', { name: 'com_acumen_confirm_confirm' }));
    expect(mockSubmitMessage).toHaveBeenCalledWith({ text: 'com_acumen_confirm_confirmed' });
  });

  it('Adjust submits the adjust reply', () => {
    render(<AcumenConfirmDock frame={frame} />);
    fireEvent.click(screen.getByRole('button', { name: 'com_acumen_confirm_adjust' }));
    expect(mockSubmitMessage).toHaveBeenCalledWith({ text: 'com_acumen_confirm_adjust_reply' });
  });

  it('disables both buttons while submitting', () => {
    render(<AcumenConfirmDock frame={frame} submitting={true} />);
    expect(screen.getByRole('button', { name: 'com_acumen_confirm_confirm' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'com_acumen_confirm_adjust' })).toBeDisabled();
  });
});
