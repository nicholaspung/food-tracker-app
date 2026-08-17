import { useCallback } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import { showQueuedOfflineAlert } from '../../lib/offlineAlerts';
import type { VisitRecord } from '../models';
import type {
  CreateVisitInput,
  UpdateVisitInput,
} from './featureStore';
import { createVisit, updateVisit } from './visitsStore';
import { syncVisitMutationCaches } from './visitsQuery';
import { completeSourceNoteAfterEntryWrite } from '../notes/sourceNoteCompletion';
import { createVisitApiMutationInput } from './featureOutboxOperations';
import {
  type OfflineAwareFeatureWrite,
  type OfflineAwareFeatureWriteResult,
  useOfflineAwareFeatureWrite,
} from './useOfflineAwareFeatureWrite';
import {
  convertVisitItemToFoodProductActionWithOfflineSupport,
  deleteVisitActionWithOfflineSupport,
  deleteVisitItemActionWithOfflineSupport,
  moveVisitItemActionWithOfflineSupport,
  type ConvertVisitItemToFoodProductActionWriteInput,
  type DeleteVisitActionWriteInput,
  type DeleteVisitItemActionWriteInput,
  type MoveVisitItemActionWriteInput,
} from './visitActionWrites';

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
        execute: createVisit.bind(null, input),
      })
    : await writeFeature({
        operationName: 'visit.create',
        offline: {
          strategy: 'outbox',
          payload: input,
        },
        execute: createVisit.bind(null, input),
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
      includeVisitPhotos: hasPhotoUploads,
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
    includeVisitPhotos: hasPhotoUploads,
    sourceNoteId: sourceNote?.noteId,
  });
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
        execute: updateVisit.bind(null, visitId, updates),
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
    async (input: DeleteVisitActionWriteInput) =>
      deleteVisitActionWithOfflineSupport({
        ...input,
        queryClient,
        writeFeature,
      }),
    [queryClient, writeFeature],
  );

  const deleteVisitItemWrite = useCallback(
    async (input: DeleteVisitItemActionWriteInput) =>
      deleteVisitItemActionWithOfflineSupport({
        ...input,
        queryClient,
        writeFeature,
      }),
    [queryClient, writeFeature],
  );

  const moveVisitItemWrite = useCallback(
    async (input: MoveVisitItemActionWriteInput) =>
      moveVisitItemActionWithOfflineSupport({
        ...input,
        queryClient,
        writeFeature,
      }),
    [queryClient, writeFeature],
  );

  const convertVisitItemToFoodProductWrite = useCallback(
    async (input: ConvertVisitItemToFoodProductActionWriteInput) =>
      convertVisitItemToFoodProductActionWithOfflineSupport({
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
    deleteVisitItem: deleteVisitItemWrite,
    moveVisitItem: moveVisitItemWrite,
    updateVisit: updateVisitWrite,
  };
}
