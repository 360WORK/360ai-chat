import { render, screen } from 'test/layout-test-utils';
import { fireEvent } from '@testing-library/react';
import SignalsManager from '../SignalsManager';

jest.mock('~/data-provider/Signals/queries', () => ({
  useSignalsQuery: () => ({
    data: {
      signals: [
        {
          id: 'sig-1',
          name: 'Weekly open-jobs briefing',
          type: 'briefing',
          isActive: true,
          nextRunAt: '2026-06-29T08:00:00.000Z',
          lastRunAt: null,
        },
      ],
    },
    isLoading: false,
  }),
  useCreateSignal: () => ({ mutateAsync: jest.fn(), isLoading: false }),
  useRunSignalNow: () => ({ mutateAsync: jest.fn(), isLoading: false }),
  useDeleteSignal: () => ({ mutateAsync: jest.fn(), isLoading: false }),
}));
jest.mock('~/hooks', () => ({
  __esModule: true,
  useLocalize: () => (key: string) => key,
}));

describe('SignalsManager', () => {
  it('renders the title and the existing signal', () => {
    render(<SignalsManager />);
    expect(screen.getByText('com_signals_title')).toBeInTheDocument();
    expect(screen.getByText('Weekly open-jobs briefing')).toBeInTheDocument();
    expect(screen.getByText('com_signals_run_now')).toBeInTheDocument();
  });

  it('opens the create form when New signal is clicked', () => {
    render(<SignalsManager />);
    fireEvent.click(screen.getByText('com_signals_new'));
    expect(screen.getByText('com_signals_create')).toBeInTheDocument();
    expect(screen.getByText('com_signals_field_tools')).toBeInTheDocument();
  });
});
