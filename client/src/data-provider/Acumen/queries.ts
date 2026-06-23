/* Acumen */
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery } from '@tanstack/react-query';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import type { TAcumenWorkspacesResponse } from 'librechat-data-provider';

export const useAcumenWorkspacesQuery = (
  config?: UseQueryOptions<TAcumenWorkspacesResponse>,
): QueryObserverResult<TAcumenWorkspacesResponse> => {
  return useQuery<TAcumenWorkspacesResponse>(
    [QueryKeys.acumenWorkspaces],
    () => dataService.getAcumenWorkspaces(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
      ...config,
    },
  );
};
