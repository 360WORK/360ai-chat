import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery } from '@tanstack/react-query';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import type { TSignalsSyncResponse } from 'librechat-data-provider';

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
  return useQuery<TSignalsSyncResponse>(
    [QueryKeys.signalsSync],
    () => dataService.syncSignals(),
    {
      refetchInterval: DEFAULT_SYNC_MS,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      retry: false,
      ...config,
    },
  );
};
