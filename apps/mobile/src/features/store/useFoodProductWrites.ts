import { useCallback } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import { showQueuedOfflineAlert } from '../../lib/offlineAlerts';
import { completeSourceNoteAfterEntryWrite } from '../notes/sourceNoteCompletion';
import type { FoodProductRecord } from '../models';
import type { CreateFoodProductInput, UpdateFoodProductInput } from './featureStore';
import {
  createFoodProduct,
  deleteFoodProduct,
  updateFoodProduct,
} from './foodProductsStore';
import { syncFoodProductMutationCaches } from './foodProductsQuery';
import {
  type OfflineAwareFeatureWrite,
  type OfflineAwareFeatureWriteResult,
  useOfflineAwareFeatureWrite,
} from './useOfflineAwareFeatureWrite';

interface SourceNoteCompletionOptions {
  noteId?: string;
  usedAt: string | null;
}

interface CreateFoodProductWriteInput {
  includeUsage: boolean;
  input: CreateFoodProductInput;
  queuedAlert?: false | Parameters<typeof showQueuedOfflineAlert>[0];
  sourceNote?: SourceNoteCompletionOptions;
}

interface UpdateFoodProductWriteInput {
  foodProductId: string;
  includeFoodProductPhotos: boolean;
  includeUsage: boolean;
  queuedAlert?: false | Parameters<typeof showQueuedOfflineAlert>[0];
  updates: UpdateFoodProductInput;
}

interface DeleteFoodProductWriteInput {
  foodProductId: string;
}

export async function createFoodProductWithOfflineSupport({
  includeUsage,
  input,
  queryClient,
  queuedAlert,
  sourceNote,
  writeFeature,
}: CreateFoodProductWriteInput & {
  queryClient: QueryClient;
  writeFeature: OfflineAwareFeatureWrite;
}): Promise<OfflineAwareFeatureWriteResult<FoodProductRecord>> {
  const result = await writeFeature({
    operationName: 'food-product.create',
    offline: {
      strategy: 'outbox',
      payload: input,
    },
    execute: () => createFoodProduct(input),
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
    await syncFoodProductMutationCaches(queryClient, {
      includeUsage,
      sourceNoteId: sourceNote?.noteId,
    });
    if (queuedAlert !== false) {
      showQueuedOfflineAlert(
        queuedAlert ?? {
          analyticsSource: 'useFoodProductWrites',
          subject: 'Food product',
        },
      );
    }
    return result;
  }

  await syncFoodProductMutationCaches(queryClient, {
    foodProduct: result.result,
    includeUsage,
    sourceNoteId: sourceNote?.noteId,
  });
  return result;
}

export function useFoodProductWrites() {
  const queryClient = useQueryClient();
  const writeFeature = useOfflineAwareFeatureWrite();

  const createFoodProductWrite = useCallback(
    async (
      input: CreateFoodProductWriteInput,
    ): Promise<OfflineAwareFeatureWriteResult<FoodProductRecord>> =>
      createFoodProductWithOfflineSupport({
        ...input,
        queryClient,
        writeFeature,
      }),
    [queryClient, writeFeature],
  );

  const updateFoodProductWrite = useCallback(
    async ({
      foodProductId,
      includeFoodProductPhotos,
      includeUsage,
      queuedAlert,
      updates,
    }: UpdateFoodProductWriteInput): Promise<OfflineAwareFeatureWriteResult<FoodProductRecord>> => {
      const result = await writeFeature({
        operationName: 'food-product.update',
        offline: {
          strategy: 'outbox',
          payload: {
            foodProductId,
            updates,
          },
        },
        execute: () => updateFoodProduct(foodProductId, updates),
      });

      if (result.status === 'queued') {
        await syncFoodProductMutationCaches(queryClient, {
          foodProductId,
          includeFoodProductPhotos,
          includeUsage,
        });
        if (queuedAlert !== false) {
          showQueuedOfflineAlert(
            queuedAlert ?? {
              analyticsSource: 'useFoodProductWrites',
              subject: 'Food product update',
            },
          );
        }
        return result;
      }

      await syncFoodProductMutationCaches(queryClient, {
        foodProduct: result.result,
        includeFoodProductPhotos,
        includeUsage,
      });
      return result;
    },
    [queryClient, writeFeature],
  );

  const deleteFoodProductWrite = useCallback(
    async ({
      foodProductId,
    }: DeleteFoodProductWriteInput): Promise<OfflineAwareFeatureWriteResult<void>> => {
      const result = await writeFeature({
        operationName: 'food-product.delete',
        offline: {
          strategy: 'outbox',
          payload: { foodProductId },
        },
        execute: () => deleteFoodProduct(foodProductId),
      });

      await syncFoodProductMutationCaches(queryClient, {
        foodProductId,
      });

      if (result.status === 'queued') {
        showQueuedOfflineAlert('Food product delete');
      }

      return result;
    },
    [queryClient, writeFeature],
  );

  return {
    createFoodProduct: createFoodProductWrite,
    deleteFoodProduct: deleteFoodProductWrite,
    updateFoodProduct: updateFoodProductWrite,
  };
}
