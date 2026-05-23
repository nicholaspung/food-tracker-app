import { useCallback } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import { showQueuedOfflineAlert } from '../../lib/offlineAlerts';
import type { VisitRecord } from '../models';
import type {
  ConvertVisitItemToFoodProductResult,
  CreateVisitInput,
  MoveVisitItemResult,
  UpdateVisitInput,
} from './featureStore';
import {
  convertVisitItemToFoodProduct,
  createVisit,
  deleteVisit,
  moveVisitItem,
  updateVisit,
} from './visitsStore';
import { homeFeedQueryKeys, invalidateHomeFeedQueries, type HomeFeedInfiniteData } from './homeFeedQuery';
import { syncFoodProductMutationCaches } from './foodProductsQuery';
import { syncVisitMutationCaches, visitsQueryKeys } from './visitsQuery';
import { completeSourceNoteAfterEntryWrite } from '../notes/sourceNoteCompletion';
import {
  createVisitApiMutationInput,
  moveVisitItemApiMutationInput,
} from './featureOutboxOperations';
import {
  type OfflineAwareFeatureWrite,
  type OfflineAwareFeatureWriteResult,
  useOfflineAwareFeatureWrite,
} from './useOfflineAwareFeatureWrite';

interface SourceNoteCompletionOptions {
  noteId?: string;
  usedAt: string | null;
}

interface CreateVisitWriteInput {
  hasPhotoUploads: boolean;
  input: CreateVisitInput;
  queuedAlert?: false | Parameters<typeof showQueuedOfflineAlert>[0];
  sourceNote?: SourceNoteCompletionOptions;
  useApiReplay: boolean;
}

interface UpdateVisitWriteInput {
  includeUsage: boolean;
  includeVisitPhotos: boolean;
  updates: UpdateVisitInput;
  visitId: string;
}

interface DeleteVisitWriteInput {
  includeVisitPhotos: boolean;
  visitId: string;
}

interface MoveVisitItemWriteInput {
  destinationVisit: VisitRecord;
  item: VisitRecord['items'][number];
  sourceVisitId: string;
}

interface ConvertVisitItemToFoodProductWriteInput {
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
  input: MoveVisitItemWriteInput,
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
  input: MoveVisitItemWriteInput,
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

export async function createVisitWithOfflineSupport({
  hasPhotoUploads,
  input,
  queryClient,
  queuedAlert,
  sourceNote,
  useApiReplay,
  writeFeature,
}: CreateVisitWriteInput & {
  queryClient: QueryClient;
  writeFeature: OfflineAwareFeatureWrite;
}): Promise<OfflineAwareFeatureWriteResult<VisitRecord>> {
  const result = useApiReplay
    ? await writeFeature({
        operationName: 'visit.create',
        offline: {
          strategy: 'api',
          input: createVisitApiMutationInput(input),
        },
        execute: () => createVisit(input),
      })
    : await writeFeature({
        operationName: 'visit.create',
        offline: {
          strategy: 'outbox',
          payload: input,
        },
        execute: () => createVisit(input),
      });

  if (sourceNote?.noteId && sourceNote.usedAt) {
    await completeSourceNoteAfterEntryWrite({
      entryWriteStatus: result.status,
      noteId: sourceNote.noteId,
      queryClient,
      usedAt: sourceNote.usedAt,
      writeFeature,
    });
  }

  if (result.status === 'queued') {
    await syncVisitMutationCaches(queryClient, {
      includeUsage: hasPhotoUploads,
      sourceNoteId: sourceNote?.noteId,
    });
    if (queuedAlert !== false) {
      showQueuedOfflineAlert(
        queuedAlert ?? {
          analyticsSource: 'useVisitWrites',
          subject: 'Visit',
        },
      );
    }
    return result;
  }

  await syncVisitMutationCaches(queryClient, {
    visit: result.result,
    includeUsage: hasPhotoUploads,
    sourceNoteId: sourceNote?.noteId,
  });
  return result;
}

export async function deleteVisitWithOfflineSupport({
  includeVisitPhotos,
  queryClient,
  visitId,
  writeFeature,
}: DeleteVisitWriteInput & {
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

export async function moveVisitItemWithOfflineSupport({
  destinationVisit,
  item,
  queryClient,
  sourceVisitId,
  writeFeature,
}: MoveVisitItemWriteInput & {
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

async function convertVisitItemToFoodProductWithOfflineSupport({
  itemId,
  queryClient,
  sourceVisitId,
  writeFeature,
}: ConvertVisitItemToFoodProductWriteInput & {
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

export function useVisitWrites() {
  const queryClient = useQueryClient();
  const writeFeature = useOfflineAwareFeatureWrite();

  const createVisitWrite = useCallback(
    async (input: CreateVisitWriteInput): Promise<OfflineAwareFeatureWriteResult<VisitRecord>> =>
      createVisitWithOfflineSupport({
        ...input,
        queryClient,
        writeFeature,
      }),
    [queryClient, writeFeature],
  );

  const updateVisitWrite = useCallback(
    async ({
      includeUsage,
      includeVisitPhotos,
      updates,
      visitId,
    }: UpdateVisitWriteInput): Promise<OfflineAwareFeatureWriteResult<VisitRecord>> => {
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
          analyticsSource: 'useVisitWrites',
          subject: 'Visit update',
        });
        return result;
      }

      await syncVisitMutationCaches(queryClient, {
        visit: result.result,
        includeUsage,
        includeVisitPhotos,
      });
      return result;
    },
    [queryClient, writeFeature],
  );

  const deleteVisitWrite = useCallback(
    async (input: DeleteVisitWriteInput): Promise<OfflineAwareFeatureWriteResult<void>> =>
      deleteVisitWithOfflineSupport({
        ...input,
        queryClient,
        writeFeature,
      }),
    [queryClient, writeFeature],
  );

  const moveVisitItemWrite = useCallback(
    async (input: MoveVisitItemWriteInput): Promise<OfflineAwareFeatureWriteResult<MoveVisitItemResult>> =>
      moveVisitItemWithOfflineSupport({
        ...input,
        queryClient,
        writeFeature,
      }),
    [queryClient, writeFeature],
  );

  const convertVisitItemToFoodProductWrite = useCallback(
    async (
      input: ConvertVisitItemToFoodProductWriteInput,
    ): Promise<OfflineAwareFeatureWriteResult<ConvertVisitItemToFoodProductResult>> =>
      convertVisitItemToFoodProductWithOfflineSupport({
        ...input,
        queryClient,
        writeFeature,
      }),
    [queryClient, writeFeature],
  );

  return {
    convertVisitItemToFoodProduct: convertVisitItemToFoodProductWrite,
    createVisit: createVisitWrite,
    deleteVisit: deleteVisitWrite,
    moveVisitItem: moveVisitItemWrite,
    updateVisit: updateVisitWrite,
  };
}
