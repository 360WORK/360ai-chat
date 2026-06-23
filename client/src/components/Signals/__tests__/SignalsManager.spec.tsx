import { render, screen, fireEvent } from 'test/layout-test-utils';
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
          cadenceCron: '0 8 * * 1',
          promptTemplate: 'Summarise open jobs.',
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
  useCreateSignal: () => ({ mutateAsync: jest.fn(), isLoading: false }),
  useUpdateSignal: () => ({ mutateAsync: jest.fn(), isLoading: false }),
  useRunSignalNow: () => ({ mutateAsync: jest.fn(), isLoading: false, variables: undefined }),
  useDeleteSignal: () => ({ mutateAsync: jest.fn(), isLoading: false }),
  useSignalLatestRunQuery: () => ({ data: undefined }),
}));
jest.mock('~/hooks', () => ({
  __esModule: true,
  useLocalize: () => (key: string) => key,
}));

describe('SignalsManager', () => {
  it('renders the title and the existing signal with a friendly cadence', () => {
    render(<SignalsManager />);
    expect(screen.getByText('com_signals_title')).toBeInTheDocument();
    expect(screen.getByText('Weekly open-jobs briefing')).toBeInTheDocument();
    expect(screen.getByText('com_signals_run_now')).toBeInTheDocument();
    expect(screen.getByText('com_signals_edit')).toBeInTheDocument();
    // friendly cadence label is shown for the weekly (Monday) signal
    expect(screen.getByText(/com_signals_cadence_weekly/)).toBeInTheDocument();
  });

  it('opens the create form with the cadence picker (no tool multi-select) when New is clicked', () => {
    render(<SignalsManager />);
    fireEvent.click(screen.getByText('com_signals_new'));
    expect(screen.getByText('com_signals_field_cadence')).toBeInTheDocument();
    expect(screen.getByText('com_signals_create')).toBeInTheDocument();
    // tool picker is gone
    expect(screen.queryByText('com_signals_field_tools')).not.toBeInTheDocument();
  });

  it('opens the edit form prefilled when Edit is clicked', () => {
    render(<SignalsManager />);
    fireEvent.click(screen.getByText('com_signals_edit'));
    // edit title + save button
    expect(screen.getByText('com_signals_edit_title')).toBeInTheDocument();
    expect(screen.getByText('com_signals_save')).toBeInTheDocument();
  });
});
