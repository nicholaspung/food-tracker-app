import type { QueryClient } from '@tanstack/react-query';

import { showQueuedOfflineAlert } from '../../lib/offlineAlerts';
import type { VisitRecord } from '../models';
import type {
  ConvertVisitItemToFoodProductResult,
  MoveVisitItemResult,
  UpdateVisitInput,
} from './featureStore';
import { moveVisitItemApiMutationInput } from './featureOutboxOperations';
import { syncFoodProductMutationCaches } from './foodProductsQuery';
import {
  homeFeedQueryKeys,
  invalidateHomeFeedQueries,
  type HomeFeedInfiniteData,
} from './homeFeedQuery';
import {
  convertVisitItemToFoodProduct,
  deleteVisit,
  moveVisitItem,
  updateVisit,
} from './visitsStore';
import { syncVisitMutationCaches, visitsQueryKeys } from './visitsQuery';
import type {
  OfflineAwareFeatureWrite,
  OfflineAwareFeatureWriteResult,
} from './useOfflineAwareFeatureWrite';

export interface DeleteVisitActionWriteInput {
  includeVisitPhotos: boolean;
  visitId: string;
}

export interface DeleteVisitItemActionWriteInput {
  includeUsage: boolean;
  includeVisitPhotos: boolean;
  updates: UpdateVisitInput;
  visitId: string;
}

export interface MoveVisitItemActionWriteInput {
  destinationVisit: VisitRecord;
  item: VisitRecord['items'][number];
  sourceVisitId: string;
}

export interface ConvertVisitItemToFoodProductActionWriteInput {
  itemId: string;
  sourceVisitId: string;
}

type VisitItemRecord = VisitRecord['items'][number];

function removeVisitItem(visit: VisitRecord, itemId: string): VisitRecord {
  return {
    ...visit,
    items: visit.items.filter((item) => item.id !== itemId),
  };
}

function appendVisitItem(visit: VisitRecord, item: VisitItemRecord): VisitRecord {
  if (visit.items.some((existingItem) => existingItem.id === item.id)) {
    return visit;
  }

  return {
    ...visit,
    items: [...visit.items, item],
  };
}

function patchVisitRecordForMovedItem(
  visit: VisitRecord | null | undefined,
  input: MoveVisitItemActionWriteInput,
): VisitRecord | null | undefined {
  if (!visit) {
    return visit;
  }

  if (visit.id === input.sourceVisitId) {
    return removeVisitItem(visit, input.item.id);
  }

  if (visit.id === input.destinationVisit.id) {
    return appendVisitItem(visit, input.item);
  }

  return visit;
}

function patchHomeFeedDataForMovedItem(
  currentData: HomeFeedInfiniteData | undefined,
  input: MoveVisitItemActionWriteInput,
): HomeFeedInfiniteData | undefined {
  if (!currentData) {
    return currentData;
  }

  return {
    ...currentData,
    pages: currentData.pages.map((page) => ({
      ...page,
      items: page.items.map((entry) => {
        if (entry.source !== 'visit') {
          return entry;
        }

        if (entry.visit.id === input.sourceVisitId) {
          return {
            ...entry,
            visit: removeVisitItem(entry.visit, input.item.id),
          };
        }

        if (entry.visit.id === input.destinationVisit.id) {
          return {
            ...entry,
            visit: appendVisitItem(entry.visit, input.item),
          };
        }

        return entry;
      }),
    })),
  };
}

async function invalidateMoveVisitItemQueries(
  queryClient: QueryClient,
  sourceVisitId: string,
  destinationVisitId: string,
): Promise<void> {
  await Promise.all([
    invalidateHomeFeedQueries(queryClient),
    queryClient.invalidateQueries({ queryKey: visitsQueryKeys.root }),
    queryClient.invalidateQueries({
      queryKey: ['feature', 'visit', sourceVisitId],
    }),
    queryClient.invalidateQueries({
      queryKey: ['feature', 'visit', destinationVisitId],
    }),
    queryClient.invalidateQueries({ queryKey: ['feature', 'visitPhotos'] }),
  ]);
}

export async function deleteVisitActionWithOfflineSupport({
  includeVisitPhotos,
  queryClient,
  visitId,
  writeFeature,
}: DeleteVisitActionWriteInput & {
  queryClient: QueryClient;
  writeFeature: OfflineAwareFeatureWrite;
}): Promise<OfflineAwareFeatureWriteResult<void>> {
  const result = await writeFeature({
    operationName: 'visit.delete',
    offline: {
      strategy: 'outbox',
      payload: { visitId },
    },
    execute: () => deleteVisit(visitId),
  });

  await syncVisitMutationCaches(queryClient, {
    visitId,
    includeVisitPhotos,
  });

  if (result.status === 'queued') {
    showQueuedOfflineAlert('Visit delete');
  }

  return result;
}

export async function deleteVisitItemActionWithOfflineSupport({
  includeUsage,
  includeVisitPhotos,
  queryClient,
  updates,
  visitId,
  writeFeature,
}: DeleteVisitItemActionWriteInput & {
  queryClient: QueryClient;
  writeFeature: OfflineAwareFeatureWrite;
}): Promise<OfflineAwareFeatureWriteResult<VisitRecord>> {
  const result = await writeFeature({
    operationName: 'visit.update',
    offline: {
      strategy: 'outbox',
      payload: {
        visitId,
        updates,
      },
    },
    execute: () => updateVisit(visitId, updates),
  });

  if (result.status === 'queued') {
    await syncVisitMutationCaches(queryClient, {
      visitId,
      includeUsage,
      includeVisitPhotos,
    });
    showQueuedOfflineAlert({
      analyticsSource: 'visitActionWrites',
      subject: 'Visit item delete',
    });
    return result;
  }

  await syncVisitMutationCaches(queryClient, {
    visit: result.result,
    includeUsage,
    includeVisitPhotos,
  });
  return result;
}

export async function moveVisitItemActionWithOfflineSupport({
  destinationVisit,
  item,
  queryClient,
  sourceVisitId,
  writeFeature,
}: MoveVisitItemActionWriteInput & {
  queryClient: QueryClient;
  writeFeature: OfflineAwareFeatureWrite;
}): Promise<OfflineAwareFeatureWriteResult<MoveVisitItemResult>> {
  const input = {
    destinationVisit,
    item,
    sourceVisitId,
  };
  const sourceVisitQueryKey = ['feature', 'visit', sourceVisitId] as const;
  const destinationVisitQueryKey = ['feature', 'visit', destinationVisit.id] as const;
  const homeFeedSnapshots = queryClient.getQueriesData<HomeFeedInfiniteData>({
    queryKey: homeFeedQueryKeys.root,
  });
  const sourceVisitSnapshot = queryClient.getQueryData<VisitRecord | null>(sourceVisitQueryKey);
  const destinationVisitSnapshot = queryClient.getQueryData<VisitRecord | null>(destinationVisitQueryKey);

  queryClient.setQueriesData<HomeFeedInfiniteData>({ queryKey: homeFeedQueryKeys.root }, (currentData) =>
    patchHomeFeedDataForMovedItem(currentData, input),
  );

  if (sourceVisitSnapshot !== undefined) {
    queryClient.setQueryData<VisitRecord | null>(
      sourceVisitQueryKey,
      patchVisitRecordForMovedItem(sourceVisitSnapshot, input),
    );
  }

  if (destinationVisitSnapshot !== undefined) {
    queryClient.setQueryData<VisitRecord | null>(
      destinationVisitQueryKey,
      patchVisitRecordForMovedItem(destinationVisitSnapshot, input),
    );
  }

  try {
    const result = await writeFeature({
      operationName: 'visit.item.move',
      offline: {
        strategy: 'api',
        input: moveVisitItemApiMutationInput(item.id, destinationVisit.id),
      },
      execute: () =>
        moveVisitItem({
          itemId: item.id,
          destinationVisitId: destinationVisit.id,
        }),
    });

    await invalidateMoveVisitItemQueries(queryClient, sourceVisitId, destinationVisit.id);

    if (result.status === 'queued') {
      showQueuedOfflineAlert('Visit item move');
    }

    return result;
  } catch (error) {
    for (const [queryKey, snapshot] of homeFeedSnapshots) {
      if (snapshot !== undefined) {
        queryClient.setQueryData(queryKey, snapshot);
      }
    }

    if (sourceVisitSnapshot !== undefined) {
      queryClient.setQueryData(sourceVisitQueryKey, sourceVisitSnapshot);
    }

    if (destinationVisitSnapshot !== undefined) {
      queryClient.setQueryData(destinationVisitQueryKey, destinationVisitSnapshot);
    }

    throw error;
  }
}

export async function convertVisitItemToFoodProductActionWithOfflineSupport({
  itemId,
  queryClient,
  sourceVisitId,
  writeFeature,
}: ConvertVisitItemToFoodProductActionWriteInput & {
  queryClient: QueryClient;
  writeFeature: OfflineAwareFeatureWrite;
}): Promise<OfflineAwareFeatureWriteResult<ConvertVisitItemToFoodProductResult>> {
  const result = await writeFeature({
    operationName: 'visit.item.convert-to-food-product',
    offline: {
      strategy: 'outbox',
      payload: {
        itemId,
      },
    },
    execute: () => convertVisitItemToFoodProduct({ itemId }),
  });

  if (result.status === 'queued') {
    await Promise.all([
      syncVisitMutationCaches(queryClient, {
        visitId: sourceVisitId,
        includeVisitPhotos: true,
      }),
      syncFoodProductMutationCaches(queryClient),
    ]);
    showQueuedOfflineAlert({
      analyticsSource: 'CreateVisitScreen',
      subject: 'Food product conversion',
    });
    return result;
  }

  await Promise.all([
    syncVisitMutationCaches(queryClient, {
      visitId: result.result.sourceVisitId,
      includeVisitPhotos: true,
    }),
    syncFoodProductMutationCaches(queryClient, {
      foodProductId: result.result.foodProductId,
      includeFoodProductPhotos: true,
    }),
  ]);
  return result;
}

export interface VisitActionWrites {
  convertVisitItemToFoodProduct(
    input: ConvertVisitItemToFoodProductActionWriteInput,
  ): Promise<OfflineAwareFeatureWriteResult<ConvertVisitItemToFoodProductResult>>;
  deleteVisit(input: DeleteVisitActionWriteInput): Promise<OfflineAwareFeatureWriteResult<void>>;
  deleteVisitItem(
    input: DeleteVisitItemActionWriteInput,
  ): Promise<OfflineAwareFeatureWriteResult<VisitRecord>>;
  moveVisitItem(
    input: MoveVisitItemActionWriteInput,
  ): Promise<OfflineAwareFeatureWriteResult<MoveVisitItemResult>>;
}

export function createVisitActionWrites({
  queryClient,
  writeFeature,
}: {
  queryClient: QueryClient;
  writeFeature: OfflineAwareFeatureWrite;
}): VisitActionWrites {
  return {
    convertVisitItemToFoodProduct: (input) =>
      convertVisitItemToFoodProductActionWithOfflineSupport({
        ...input,
        queryClient,
        writeFeature,
      }),
    deleteVisit: (input) =>
      deleteVisitActionWithOfflineSupport({
        ...input,
        queryClient,
        writeFeature,
      }),
    deleteVisitItem: (input) =>
      deleteVisitItemActionWithOfflineSupport({
        ...input,
        queryClient,
        writeFeature,
      }),
    moveVisitItem: (input) =>
      moveVisitItemActionWithOfflineSupport({
        ...input,
        queryClient,
        writeFeature,
      }),
  };
}
