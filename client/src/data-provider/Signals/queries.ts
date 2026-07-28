import { useState, useEffect, useRef } from 'react';
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
    staleTime: 60 * 1000,
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

const RUN_POLL_BASE_MS = 2000;
const RUN_POLL_MAX_MS = 10 * 1000;
const RUN_POLL_TIMEOUT_MS = 3 * 60 * 1000;
const RUN_POLL_MAX_CONSECUTIVE_ERRORS = 5;

export type TSignalRunPollResult = {
  data: TSignalLatestRun | undefined;
  isError: boolean;
  /** True once polling gave up (timeout or repeated errors) before a terminal status. */
  halted: boolean;
};

/**
 * Poll a specific run (by id) until it reaches a terminal status. Pass the
 * runId returned synchronously by run_signal_now. Polls with exponential
 * backoff (2s → 4s → 8s, capped at 10s) and auto-halts once terminal — or
 * gives up (`halted: true`) after ~3 minutes of polling or 5 consecutive
 * errors (e.g. the run never appears in the latest-runs window, or the
 * upstream MCP is down) so callers can surface an error and stop spinners.
 */
export const useSignalRunQuery = (
  runId: string | null,
  options?: { enabled?: boolean },
): TSignalRunPollResult => {
  const enabled = !!runId && (options?.enabled ?? false);
  const [halted, setHalted] = useState(false);
  const startedAtRef = useRef(Date.now());
  const attemptsRef = useRef(0);
  const errorsRef = useRef(0);

  useEffect(() => {
    startedAtRef.current = Date.now();
    attemptsRef.current = 0;
    errorsRef.current = 0;
    setHalted(false);
  }, [runId]);

  const query = useQuery<TSignalLatestRun>(
    ['signalRun', runId],
    () => {
      attemptsRef.current += 1;
      return dataService.getSignalRun(runId as string);
    },
    {
      enabled: enabled && !halted,
      retry: false,
      onSuccess: () => {
        errorsRef.current = 0;
      },
      onError: () => {
        errorsRef.current += 1;
      },
      refetchInterval: (data) => {
        if (data && TERMINAL_RUN_STATUSES.has(data.status)) {
          return false;
        }
        const expired = Date.now() - startedAtRef.current >= RUN_POLL_TIMEOUT_MS;
        if (expired || errorsRef.current >= RUN_POLL_MAX_CONSECUTIVE_ERRORS) {
          setHalted(true);
          return false;
        }
        const exponent = Math.max(attemptsRef.current - 1, 0);
        return Math.min(RUN_POLL_BASE_MS * 2 ** exponent, RUN_POLL_MAX_MS);
      },
    },
  );

  return { data: query.data, isError: query.isError, halted };
};
