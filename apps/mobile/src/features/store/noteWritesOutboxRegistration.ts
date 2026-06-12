import { createFeatureOutboxDomainRegistration } from './featureOutboxDomainRegistration';
import type { FeatureOutboxOperationPayloadMap } from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import {
  createNote,
  deleteNote,
  markNoteUsed,
  updateNote,
} from './featureStore';

export const NOTE_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: [
    'note.create',
    'note.update',
    'note.delete',
    'note.mark-used',
  ] as const,
  replayAdapters: {
    'note.create': replayNoteCreate,
    'note.update': replayNoteUpdate,
    'note.delete': replayNoteDelete,
    'note.mark-used': replayNoteMarkUsed,
  },
});

async function replayNoteCreate(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createNote(payload as FeatureOutboxOperationPayloadMap['note.create'], requestOptions);
}

async function replayNoteUpdate(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const noteUpdatePayload = payload as FeatureOutboxOperationPayloadMap['note.update'];
  await updateNote(noteUpdatePayload.noteId, noteUpdatePayload.updates, requestOptions);
}

async function replayNoteDelete(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const noteDeletePayload = payload as FeatureOutboxOperationPayloadMap['note.delete'];
  await deleteNote(noteDeletePayload.noteId, requestOptions);
}

async function replayNoteMarkUsed(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await markNoteUsed(payload as FeatureOutboxOperationPayloadMap['note.mark-used'], requestOptions);
}
