import { render, screen, fireEvent } from 'test/layout-test-utils';
import SignalsManager from '../SignalsManager';

const mockUpdateMutateAsync = jest.fn().mockResolvedValue({});
const mockSignals: Array<Record<string, unknown>> = [
  {
    id: 'sig-1',
    name: 'Weekly open-jobs briefing',
    type: 'briefing',
    isActive: true,
    nextRunAt: '2026-06-29T08:00:00.000Z',
    lastRunAt: null,
    cadenceCron: '0 8 * * 1',
    promptTemplate: 'Summarise open jobs.',
    timezone: null,
  },
];
let mockRunQueryResult: { data: Record<string, unknown> | undefined; halted?: boolean } = {
  data: undefined,
};

jest.mock('~/data-provider/Signals/queries', () => ({
  useSignalsQuery: () => ({
    data: { signals: mockSignals },
    isLoading: false,
    isError: false,
  }),
  useCreateSignal: () => ({ mutateAsync: jest.fn(), isLoading: false }),
  useUpdateSignal: () => ({ mutateAsync: mockUpdateMutateAsync, isLoading: false }),
  useRunSignalNow: () => ({
    mutateAsync: jest.fn().mockResolvedValue({ signalId: 'sig-1', signalRunId: 'run-9' }),
    isLoading: false,
    variables: undefined,
  }),
  useDeleteSignal: () => ({ mutateAsync: jest.fn(), isLoading: false }),
  useSignalRunQuery: () => mockRunQueryResult,
}));
jest.mock('~/hooks', () => ({
  __esModule: true,
  useLocalize: () => (key: string) => key,
}));

describe('SignalsManager', () => {
  beforeEach(() => {
    mockUpdateMutateAsync.mockClear();
    mockSignals[0].isActive = true;
    mockRunQueryResult = { data: undefined };
  });

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

  it('shows a Pause action for active signals and toggles is_active off', async () => {
    render(<SignalsManager />);
    const pause = screen.getByText('com_signals_pause');
    expect(screen.queryByText('com_signals_paused')).not.toBeInTheDocument();
    fireEvent.click(pause);
    await screen.findByText('com_signals_pause');
    expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
      id: 'sig-1',
      input: { is_active: false },
    });
  });

  it('shows a Paused badge and a Resume action for inactive signals', async () => {
    mockSignals[0].isActive = false;
    render(<SignalsManager />);
    expect(screen.getByText('com_signals_paused')).toBeInTheDocument();
    fireEvent.click(screen.getByText('com_signals_resume'));
    await screen.findByText('com_signals_resume');
    expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
      id: 'sig-1',
      input: { is_active: true },
    });
  });

  it('surfaces the run error detail when a triggered run fails', async () => {
    mockRunQueryResult = {
      data: { status: 'failed', summary: null, createdAt: null, error: 'Upstream tool timed out' },
      halted: false,
    };
    render(<SignalsManager />);
    fireEvent.click(screen.getByText('com_signals_run_now'));
    expect(await screen.findByText('com_signals_result_failed')).toBeInTheDocument();
    expect(screen.getByText('Upstream tool timed out')).toBeInTheDocument();
  });
});
