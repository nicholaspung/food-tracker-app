import { useCallback } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import { showQueuedOfflineAlert } from '../../lib/offlineAlerts';
import type { NoteRecord } from '../models';
import type { CreateNoteInput, MarkNoteUsedInput, UpdateNoteInput } from './featureStore';
import { applyNoteUsedCacheEffects, writeNoteUsedWithOfflineSupport } from './noteUsedWrite';
import { removeCachedNote } from './notesCache';
import { notesQueryKeys } from './notesQuery';
import {
  createNote,
  deleteNote,
  updateNote,
} from './notesStore';
import {
  type OfflineAwareFeatureWriteResult,
  useOfflineAwareFeatureWrite,
} from './useOfflineAwareFeatureWrite';

interface UpdateNoteWriteInput {
  noteId: string;
  updates: UpdateNoteInput;
}

interface DeleteNoteWriteInput {
  noteId: string;
}

async function invalidateNoteBrowseQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: notesQueryKeys.root });
}

async function invalidateNotePhotoQueries(
  queryClient: QueryClient,
  noteId?: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['feature', 'notePhotos'] }),
    ...(noteId
      ? [queryClient.invalidateQueries({ queryKey: ['feature', 'notePhotos', noteId] })]
      : []),
  ]);
}

async function syncSavedNoteCaches(
  queryClient: QueryClient,
  options: {
    hasNewPhotos?: boolean;
    note?: NoteRecord;
    noteId?: string;
  } = {},
): Promise<void> {
  const noteId = options.note?.id ?? options.noteId;

  if (options.note) {
    queryClient.setQueryData(notesQueryKeys.detail(options.note.id), options.note);
  }

  const invalidations: Promise<unknown>[] = [
    invalidateNoteBrowseQueries(queryClient),
    invalidateNotePhotoQueries(queryClient, noteId),
  ];

  if (options.hasNewPhotos) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: ['feature', 'usage', 'monthly'] }));
  }

  await Promise.all(invalidations);
}

export function useNoteWrites() {
  const queryClient = useQueryClient();
  const writeFeature = useOfflineAwareFeatureWrite();

  const createNoteWrite = useCallback(
    async (input: CreateNoteInput): Promise<OfflineAwareFeatureWriteResult<NoteRecord>> => {
      const result = await writeFeature({
        operationName: 'note.create',
        offline: {
          strategy: 'outbox',
          payload: input,
        },
        execute: () => createNote(input),
      });

      if (result.status === 'queued') {
        await invalidateNoteBrowseQueries(queryClient);
        showQueuedOfflineAlert({
          analyticsSource: 'useNoteWrites',
          subject: 'Note',
        });
        return result;
      }

      await syncSavedNoteCaches(queryClient, {
        hasNewPhotos: (input.photos?.length ?? 0) > 0,
        note: result.result,
      });
      return result;
    },
    [queryClient, writeFeature],
  );

  const updateNoteWrite = useCallback(
    async ({
      noteId,
      updates,
    }: UpdateNoteWriteInput): Promise<OfflineAwareFeatureWriteResult<NoteRecord>> => {
      const result = await writeFeature({
        operationName: 'note.update',
        offline: {
          strategy: 'outbox',
          payload: {
            noteId,
            updates,
          },
        },
        execute: () => updateNote(noteId, updates),
      });

      if (result.status === 'queued') {
        await invalidateNoteBrowseQueries(queryClient);
        showQueuedOfflineAlert('Note update');
        return result;
      }

      await syncSavedNoteCaches(queryClient, {
        hasNewPhotos: (updates.newPhotos?.length ?? 0) > 0,
        note: result.result,
      });
      return result;
    },
    [queryClient, writeFeature],
  );

  const deleteNoteWrite = useCallback(
    async ({ noteId }: DeleteNoteWriteInput): Promise<OfflineAwareFeatureWriteResult<void>> => {
      const result = await writeFeature({
        operationName: 'note.delete',
        offline: {
          strategy: 'outbox',
          payload: { noteId },
        },
        execute: () => deleteNote(noteId),
      });

      removeCachedNote(queryClient, noteId);
      await Promise.all([
        invalidateNoteBrowseQueries(queryClient),
        invalidateNotePhotoQueries(queryClient),
      ]);

      if (result.status === 'queued') {
        showQueuedOfflineAlert({
          analyticsSource: 'useNoteWrites',
          subject: 'Note delete',
        });
      }

      return result;
    },
    [queryClient, writeFeature],
  );

  const markNoteUsedWrite = useCallback(
    async (input: MarkNoteUsedInput): Promise<OfflineAwareFeatureWriteResult<void>> => {
      const result = await writeNoteUsedWithOfflineSupport(writeFeature, input);

      applyNoteUsedCacheEffects(queryClient, {
        noteId: input.noteId,
        usedAt: input.usedAt ?? new Date().toISOString(),
      });
      await invalidateNoteBrowseQueries(queryClient);

      return result;
    },
    [queryClient, writeFeature],
  );

  return {
    createNote: createNoteWrite,
    deleteNote: deleteNoteWrite,
    markNoteUsed: markNoteUsedWrite,
    updateNote: updateNoteWrite,
  };
}
