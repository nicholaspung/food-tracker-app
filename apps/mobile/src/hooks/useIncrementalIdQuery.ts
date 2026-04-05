import { useEffect, useMemo, useRef } from 'react';
import { type QueryKey, useQuery, useQueryClient } from '@tanstack/react-query';

interface IncrementalIdQueryState<TRecord, TId extends string> {
  loadedIds: TId[];
  records: TRecord[];
}

interface UseIncrementalIdQueryOptions<TRecord, TId extends string> {
  enabled?: boolean;
  fetchByIds: (ids: TId[]) => Promise<TRecord[]>;
  getRecordIds: (record: TRecord) => readonly TId[];
  getRecordKey: (record: TRecord) => string;
  ids: readonly TId[];
  queryKey: QueryKey;
}

function filterRecordsByIds<TRecord, TId extends string>(
  records: readonly TRecord[],
  ids: readonly TId[],
  getRecordIds: (record: TRecord) => readonly TId[],
): TRecord[] {
  if (records.length === 0 || ids.length === 0) {
    return [];
  }

  const targetIds = new Set(ids);

  return records.filter((record) => {
    for (const recordId of getRecordIds(record)) {
      if (targetIds.has(recordId)) {
        return true;
      }
    }

    return false;
  });
}

function mergeRecords<TRecord>(
  records: readonly TRecord[],
  incomingRecords: readonly TRecord[],
  getRecordKey: (record: TRecord) => string,
): TRecord[] {
  const mergedRecords = new Map<string, TRecord>();

  for (const record of records) {
    mergedRecords.set(getRecordKey(record), record);
  }

  for (const record of incomingRecords) {
    mergedRecords.set(getRecordKey(record), record);
  }

  return Array.from(mergedRecords.values());
}

function updateQueryState<TRecord, TId extends string>(
  currentState: IncrementalIdQueryState<TRecord, TId>,
  fetchedIds: readonly TId[],
  fetchedRecords: readonly TRecord[],
  getRecordIds: (record: TRecord) => readonly TId[],
  getRecordKey: (record: TRecord) => string,
): IncrementalIdQueryState<TRecord, TId> {
  const fetchedIdSet = new Set(fetchedIds);
  const preservedRecords = currentState.records.filter((record) => {
    for (const recordId of getRecordIds(record)) {
      if (fetchedIdSet.has(recordId)) {
        return false;
      }
    }

    return true;
  });

  const loadedIds = Array.from(new Set([...currentState.loadedIds, ...fetchedIds]));

  return {
    loadedIds,
    records: mergeRecords(preservedRecords, fetchedRecords, getRecordKey),
  };
}

export function useIncrementalIdQuery<TRecord, TId extends string>({
  enabled = true,
  fetchByIds,
  getRecordIds,
  getRecordKey,
  ids,
  queryKey,
}: UseIncrementalIdQueryOptions<TRecord, TId>) {
  const queryClient = useQueryClient();
  const incrementalIdsRef = useRef<TId[] | null>(null);
  const uniqueIds = useMemo(() => Array.from(new Set(ids)), [ids]);
  const latestIdsRef = useRef(uniqueIds);

  latestIdsRef.current = uniqueIds;

  const isEnabled = enabled && uniqueIds.length > 0;

  const query = useQuery<IncrementalIdQueryState<TRecord, TId>>({
    queryKey,
    enabled: isEnabled,
    queryFn: async () => {
      const incrementalIds = incrementalIdsRef.current;
      incrementalIdsRef.current = null;

      const targetIds =
        incrementalIds && incrementalIds.length > 0 ? incrementalIds : latestIdsRef.current;

      if (targetIds.length === 0) {
        return {
          loadedIds: [],
          records: [],
        } satisfies IncrementalIdQueryState<TRecord, TId>;
      }

      const fetchedRecords = await fetchByIds([...targetIds]);
      const currentState =
        queryClient.getQueryData<IncrementalIdQueryState<TRecord, TId>>(queryKey) ??
        ({
          loadedIds: [],
          records: [],
        } satisfies IncrementalIdQueryState<TRecord, TId>);

      return updateQueryState(currentState, targetIds, fetchedRecords, getRecordIds, getRecordKey);
    },
  });

  const visibleRecords = useMemo(
    () =>
      query.data ? filterRecordsByIds(query.data.records, uniqueIds, getRecordIds) : undefined,
    [getRecordIds, query.data, uniqueIds],
  );

  const missingIds = useMemo(() => {
    const loadedIds = new Set(query.data?.loadedIds ?? []);
    return uniqueIds.filter((id) => !loadedIds.has(id));
  }, [query.data?.loadedIds, uniqueIds]);

  const missingIdsKey = useMemo(() => missingIds.join('\u0000'), [missingIds]);
  const { fetchStatus, isError, refetch } = query;

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
