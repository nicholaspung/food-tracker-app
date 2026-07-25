import { useCallback } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

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
import { useFeatureWriteSubmit } from './useFeatureWriteSubmit';
import { usageQueryKeys } from './usageQuery';

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
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: usageQueryKeys.monthlyRoot }),
    );
  }

  await Promise.all(invalidations);
}

export function useNoteWrites() {
  const queryClient = useQueryClient();
  const writeFeature = useOfflineAwareFeatureWrite();
  const { submitFeatureWrite } = useFeatureWriteSubmit();

  const createNoteWrite = useCallback(
    async (input: CreateNoteInput): Promise<OfflineAwareFeatureWriteResult<NoteRecord>> => {
      return submitFeatureWrite({
        operationName: 'note.create',
        offline: {
          strategy: 'outbox',
          payload: input,
        },
        execute: () => createNote(input),
        fallbackErrorMessage: 'Could not create note.',
        onQueued: () => invalidateNoteBrowseQueries(queryClient),
        onSuccess: (note) =>
          syncSavedNoteCaches(queryClient, {
            hasNewPhotos: (input.photos?.length ?? 0) > 0,
            note,
          }),
        queuedToast: {
          analyticsSource: 'useNoteWrites',
          subject: 'Note',
        },
      });
    },
    [queryClient, submitFeatureWrite],
  );

  const updateNoteWrite = useCallback(
    async ({
      noteId,
      updates,
    }: UpdateNoteWriteInput): Promise<OfflineAwareFeatureWriteResult<NoteRecord>> => {
      return submitFeatureWrite({
        operationName: 'note.update',
        offline: {
          strategy: 'outbox',
          payload: {
            noteId,
            updates,
          },
        },
        execute: () => updateNote(noteId, updates),
        fallbackErrorMessage: 'Could not update note.',
        onQueued: () => invalidateNoteBrowseQueries(queryClient),
        onSuccess: (note) =>
          syncSavedNoteCaches(queryClient, {
            hasNewPhotos: (updates.newPhotos?.length ?? 0) > 0,
            note,
          }),
        queuedToast: 'Note update',
      });
    },
    [queryClient, submitFeatureWrite],
  );

  const deleteNoteWrite = useCallback(
    async ({ noteId }: DeleteNoteWriteInput): Promise<OfflineAwareFeatureWriteResult<void>> => {
      const syncDeletedNoteCaches = async () => {
        removeCachedNote(queryClient, noteId);
        await Promise.all([
          invalidateNoteBrowseQueries(queryClient),
          invalidateNotePhotoQueries(queryClient),
        ]);
      };

      return submitFeatureWrite({
        operationName: 'note.delete',
        offline: {
          strategy: 'outbox',
          payload: { noteId },
        },
        execute: () => deleteNote(noteId),
        fallbackErrorMessage: 'Could not delete note.',
        onQueued: syncDeletedNoteCaches,
        onSuccess: syncDeletedNoteCaches,
        queuedToast: {
          analyticsSource: 'useNoteWrites',
          subject: 'Note delete',
        },
      });
    },
    [queryClient, submitFeatureWrite],
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
