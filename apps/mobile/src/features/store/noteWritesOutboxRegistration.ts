import { createFeatureOutboxDomainRegistration } from './featureOutboxDomainRegistration';
import { createFeatureOutboxPayloadDecoder } from './featureOutboxPayloadDecoders';
import type { FeatureOutboxOperationPayloadMap } from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import {
  createNote,
  deleteNote,
  markNoteUsed,
  updateNote,
} from './notesStore';

export const NOTE_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: [
    'note.create',
    'note.update',
    'note.delete',
    'note.mark-used',
  ] as const,
  payloadDecoders: {
    'note.create': createFeatureOutboxPayloadDecoder('note.create', [
      { key: 'content', type: 'string' },
      { key: 'title', type: 'string', allowEmpty: true, optional: true },
    ]),
    'note.update': createFeatureOutboxPayloadDecoder('note.update', [
      { key: 'noteId', type: 'string' },
      { key: 'updates', type: 'record' },
    ]),
    'note.delete': createFeatureOutboxPayloadDecoder('note.delete', [
      { key: 'noteId', type: 'string' },
    ]),
    'note.mark-used': createFeatureOutboxPayloadDecoder('note.mark-used', [
      { key: 'noteId', type: 'string' },
    ]),
  },
  replayAdapters: {
    'note.create': replayNoteCreate,
    'note.update': replayNoteUpdate,
    'note.delete': replayNoteDelete,
    'note.mark-used': replayNoteMarkUsed,
  },
});

async function replayNoteCreate(
  payload: FeatureOutboxOperationPayloadMap['note.create'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createNote(payload, requestOptions);
}

async function replayNoteUpdate(
  noteUpdatePayload: FeatureOutboxOperationPayloadMap['note.update'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await updateNote(noteUpdatePayload.noteId, noteUpdatePayload.updates, requestOptions);
}

async function replayNoteDelete(
  noteDeletePayload: FeatureOutboxOperationPayloadMap['note.delete'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await deleteNote(noteDeletePayload.noteId, requestOptions);
}

async function replayNoteMarkUsed(
  payload: FeatureOutboxOperationPayloadMap['note.mark-used'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await markNoteUsed(payload, requestOptions);
}
