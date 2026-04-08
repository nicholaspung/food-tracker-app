import { useEffect, useMemo, useRef } from 'react';
import { type QueryKey, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createEmptyIncrementalIdQueryState,
  filterRecordsByIds,
  type IncrementalIdQueryState,
  updateIncrementalIdQueryState,
  pruneIncrementalIdQueryState,
} from './incrementalIdQueryState';

interface UseIncrementalIdQueryOptions<TRecord, TId extends string> {
  enabled?: boolean;
  fetchByIds: (ids: TId[]) => Promise<TRecord[]>;
  getRecordIds: (record: TRecord) => readonly TId[];
  getRecordKey: (record: TRecord) => string;
  ids: readonly TId[];
  maxRetainedHistoryIds?: number;
  queryKey: QueryKey;
}

export function useIncrementalIdQuery<TRecord, TId extends string>({
  enabled = true,
  fetchByIds,
  getRecordIds,
  getRecordKey,
  ids,
  maxRetainedHistoryIds,
  queryKey,
}: UseIncrementalIdQueryOptions<TRecord, TId>) {
  const queryClient = useQueryClient();
  const incrementalIdsRef = useRef<TId[] | null>(null);
  const uniqueIds = useMemo(() => Array.from(new Set(ids)), [ids]);
  const getRecordIdsRef = useRef(getRecordIds);
  const getRecordKeyRef = useRef(getRecordKey);
  const latestIdsRef = useRef(uniqueIds);
  const queryKeySignature = JSON.stringify(queryKey);
  const stableQueryKeyRef = useRef(queryKey);
  const stableQueryKeySignatureRef = useRef(queryKeySignature);
  const uniqueIdsKey = useMemo(() => uniqueIds.join('\u0000'), [uniqueIds]);

  if (stableQueryKeySignatureRef.current !== queryKeySignature) {
    stableQueryKeyRef.current = queryKey;
    stableQueryKeySignatureRef.current = queryKeySignature;
  }

  getRecordIdsRef.current = getRecordIds;
  getRecordKeyRef.current = getRecordKey;
  latestIdsRef.current = uniqueIds;
  const stableQueryKey = stableQueryKeyRef.current;

  const isEnabled = enabled && uniqueIds.length > 0;

  const query = useQuery<IncrementalIdQueryState<TRecord, TId>>({
    queryKey: stableQueryKey,
    enabled: isEnabled,
    queryFn: async () => {
      const incrementalIds = incrementalIdsRef.current;
      incrementalIdsRef.current = null;

      const targetIds =
        incrementalIds && incrementalIds.length > 0 ? incrementalIds : latestIdsRef.current;

      if (targetIds.length === 0) {
        return createEmptyIncrementalIdQueryState<TRecord, TId>();
      }

      const fetchedRecords = await fetchByIds([...targetIds]);
      const currentState =
        queryClient.getQueryData<IncrementalIdQueryState<TRecord, TId>>(stableQueryKey) ??
        createEmptyIncrementalIdQueryState<TRecord, TId>();

      return updateIncrementalIdQueryState(
        currentState,
        targetIds,
        fetchedRecords,
        latestIdsRef.current,
        getRecordIdsRef.current,
        getRecordKeyRef.current,
        maxRetainedHistoryIds,
      );
    },
  });

  const visibleRecords = useMemo(
    () =>
      query.data ? filterRecordsByIds(query.data.records, uniqueIds, getRecordIdsRef.current) : undefined,
    [query.data, uniqueIds],
  );

  const missingIds = useMemo(() => {
    const loadedIds = new Set(query.data?.loadedIds ?? []);
    return uniqueIds.filter((id) => !loadedIds.has(id));
  }, [query.data?.loadedIds, uniqueIds]);

  const missingIdsKey = useMemo(() => missingIds.join('\u0000'), [missingIds]);
  const { fetchStatus, isError, refetch } = query;

  useEffect(() => {
    const currentState = queryClient.getQueryData<IncrementalIdQueryState<TRecord, TId>>(stableQueryKey);
    if (!currentState) {
      return;
    }

    const nextState = pruneIncrementalIdQueryState(
      currentState,
      latestIdsRef.current,
      getRecordIdsRef.current,
      maxRetainedHistoryIds,
    );

    if (nextState !== currentState) {
      queryClient.setQueryData(stableQueryKey, nextState);
    }
  }, [maxRetainedHistoryIds, queryClient, stableQueryKey, uniqueIdsKey]);

  useEffect(() => {
    if (!isEnabled || missingIds.length === 0) {
      return;
    }

    if (fetchStatus !== 'idle' || isError) {
      return;
    }

    incrementalIdsRef.current = missingIds;
    void refetch();
  }, [fetchStatus, isEnabled, isError, missingIds, missingIdsKey, refetch]);

  return {
    ...query,
    data: visibleRecords,
  };
}
