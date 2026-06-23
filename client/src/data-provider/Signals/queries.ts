import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  UseQueryOptions,
  QueryObserverResult,
  UseMutationResult,
} from '@tanstack/react-query';
import type {
  TSignalsSyncResponse,
  TSignalsResponse,
  TSignalCreateInput,
  TSignalCreateResponse,
  TSignalRunResponse,
  TSignalUpdateInput,
  TSignalLatestRun,
} from 'librechat-data-provider';

/**
 * Periodically deliver new signal-run digests into the authenticated user's
 * "Signals" conversation by calling `POST /api/signals/sync`.
 *
 * Runs on an interval + on window focus while the app is open, so new digests
 * appear on the next messages refetch. Failures are silent (no retry, no UI):
 * the endpoint itself never throws and returns `{ delivered: 0 }` on error.
 *
 * Pass `enabled: false` to opt out (e.g. for unauthenticated/gated contexts).
 */
const DEFAULT_SYNC_MS = 5 * 60 * 1000; // 5 minutes

export const useSignalsSync = (
  config?: UseQueryOptions<TSignalsSyncResponse>,
): QueryObserverResult<TSignalsSyncResponse> => {
  return useQuery<TSignalsSyncResponse>([QueryKeys.signalsSync], () => dataService.syncSignals(), {
    refetchInterval: DEFAULT_SYNC_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: true,
    retry: false,
    ...config,
  });
};

/** List the authenticated user's signals. */
export const useSignalsQuery = (
  config?: UseQueryOptions<TSignalsResponse>,
): QueryObserverResult<TSignalsResponse> => {
  return useQuery<TSignalsResponse>([QueryKeys.signalsList], () => dataService.getSignals(), {
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    retry: 1,
    ...config,
  });
};

/** Invalidate the signals list (used after mutations). */
function useInvalidateSignals() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries([QueryKeys.signalsList]);
  };
}

/** Create a signal; invalidates the list on success. */
export const useCreateSignal = (): UseMutationResult<
  TSignalCreateResponse,
  unknown,
  TSignalCreateInput
> => {
  const invalidate = useInvalidateSignals();
  return useMutation((input) => dataService.createSignal(input), {
    onSuccess: invalidate,
  });
};

/** Update a signal (partial); invalidates the list on success. */
export const useUpdateSignal = (): UseMutationResult<
  TSignalCreateResponse,
  unknown,
  { id: string; input: TSignalUpdateInput }
> => {
  const invalidate = useInvalidateSignals();
  return useMutation(({ id, input }) => dataService.updateSignal(id, input), {
    onSuccess: invalidate,
  });
};

/** Run a signal now; invalidates the list on success (refreshes nextRunAt). */
export const useRunSignalNow = (): UseMutationResult<TSignalRunResponse, unknown, string> => {
  const invalidate = useInvalidateSignals();
  return useMutation((id: string) => dataService.runSignalNow(id), {
    onSuccess: invalidate,
  });
};

/** Delete a signal; invalidates the list on success. */
export const useDeleteSignal = (): UseMutationResult<unknown, unknown, string> => {
  const invalidate = useInvalidateSignals();
  return useMutation((id: string) => dataService.deleteSignal(id), {
    onSuccess: invalidate,
  });
};

/** Run statuses that are terminal (no more polling). */
const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'no_change']);

/**
 * Poll the latest run for a signal until it reaches a terminal status.
 * Only enable while a run is in-flight: pass `enabled` true after clicking Run,
 * and the query auto-disables (via `refetchInterval`) once the status is
 * terminal so polling stops. Returns the latest run (status + summary).
 */
export const useSignalLatestRunQuery = (
  signalId: string | null,
  options?: { enabled?: boolean },
): QueryObserverResult<TSignalLatestRun> => {
  const enabled = !!signalId && (options?.enabled ?? false);
  return useQuery<TSignalLatestRun>(
    ['signalLatestRun', signalId],
    () => dataService.getSignalLatestRun(signalId as string),
    {
      enabled,
      // Poll every 2s while non-terminal; the refetchInterval function returns
      // false (stop) once the data is terminal, which halts polling.
      refetchInterval: (data) => (data && TERMINAL_RUN_STATUSES.has(data.status) ? false : 2000),
      retry: false,
    },
  );
};
