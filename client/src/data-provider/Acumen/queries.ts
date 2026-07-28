/* Acumen */
import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import type { TAcumenWorkspacesResponse, TAcumenActiveResponse } from 'librechat-data-provider';

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

export const useAcumenActiveQuery = (
  conversationId?: string,
  lastMessageId?: string,
): QueryObserverResult<TAcumenActiveResponse> => {
  return useQuery<TAcumenActiveResponse>(
    [QueryKeys.acumenActive, conversationId, lastMessageId],
    () => dataService.getAcumenActive(conversationId),
    {
      enabled: Boolean(conversationId),
      staleTime: 15_000,
    },
  );
};
