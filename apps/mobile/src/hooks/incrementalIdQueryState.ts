interface IncrementalIdQueryState<TRecord, TId extends string> {
  loadedIds: TId[];
  records: TRecord[];
}

// Retain the current visible IDs plus a bounded tail of recent historical IDs.
const DEFAULT_INCREMENTAL_ID_QUERY_HISTORY_LIMIT = 200;

function areArraysShallowEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function buildRecentLoadedIds<TId extends string>(
  existingIds: readonly TId[],
  fetchedIds: readonly TId[],
): TId[] {
  const fetchedIdSet = new Set(fetchedIds);
  const recentIds: TId[] = [];
  const seenIds = new Set<TId>();

  for (const id of existingIds) {
    if (fetchedIdSet.has(id) || seenIds.has(id)) {
      continue;
    }

    recentIds.push(id);
    seenIds.add(id);
  }

  for (const id of fetchedIds) {
    if (seenIds.has(id)) {
      continue;
    }

    recentIds.push(id);
    seenIds.add(id);
  }

  return recentIds;
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

function normalizeHistoryLimit(maxRetainedHistoryIds: number): number {
  if (!Number.isFinite(maxRetainedHistoryIds)) {
    return DEFAULT_INCREMENTAL_ID_QUERY_HISTORY_LIMIT;
  }

  return Math.max(0, Math.floor(maxRetainedHistoryIds));
}

export function pruneIncrementalIdQueryState<TRecord, TId extends string>(
  currentState: IncrementalIdQueryState<TRecord, TId>,
  visibleIds: readonly TId[],
  getRecordIds: (record: TRecord) => readonly TId[],
  maxRetainedHistoryIds = DEFAULT_INCREMENTAL_ID_QUERY_HISTORY_LIMIT,
): IncrementalIdQueryState<TRecord, TId> {
  if (currentState.loadedIds.length === 0 && currentState.records.length === 0) {
    return currentState;
  }

  const retainedVisibleIds = Array.from(new Set(visibleIds));
  const retainedIdSet = new Set<TId>(retainedVisibleIds);
  const boundedHistoryLimit = normalizeHistoryLimit(maxRetainedHistoryIds);
  let retainedHistoryCount = 0;

  if (boundedHistoryLimit > 0) {
    for (let index = currentState.loadedIds.length - 1; index >= 0; index -= 1) {
      const id = currentState.loadedIds[index];
      if (!id || retainedIdSet.has(id)) {
        continue;
      }

      retainedIdSet.add(id);
      retainedHistoryCount += 1;
      if (retainedHistoryCount >= boundedHistoryLimit) {
        break;
      }
    }
  }

  const nextLoadedIds = currentState.loadedIds.filter((id) => retainedIdSet.has(id));
  const nextRecords = filterRecordsByIds(currentState.records, nextLoadedIds, getRecordIds);

  if (
    areArraysShallowEqual(nextLoadedIds, currentState.loadedIds) &&
    areArraysShallowEqual(nextRecords, currentState.records)
  ) {
    return currentState;
  }

  return {
    loadedIds: nextLoadedIds,
    records: nextRecords,
  };
}

export function updateIncrementalIdQueryState<TRecord, TId extends string>(
  currentState: IncrementalIdQueryState<TRecord, TId>,
  fetchedIds: readonly TId[],
  fetchedRecords: readonly TRecord[],
  visibleIds: readonly TId[],
  getRecordIds: (record: TRecord) => readonly TId[],
  getRecordKey: (record: TRecord) => string,
  maxRetainedHistoryIds = DEFAULT_INCREMENTAL_ID_QUERY_HISTORY_LIMIT,
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

  return pruneIncrementalIdQueryState(
    {
      loadedIds: buildRecentLoadedIds(currentState.loadedIds, fetchedIds),
      records: mergeRecords(preservedRecords, fetchedRecords, getRecordKey),
    },
    visibleIds,
    getRecordIds,
    maxRetainedHistoryIds,
  );
}
