import type { QueryClient } from '@tanstack/react-query';

import {
  createFeatureOutboxDomainRegistration,
  getReplayIdentityString,
  hasReplayCacheHint,
  pickFeatureOutboxReplayIdentity,
  type FeatureOutboxSuccessfulReplayOutcome,
} from './featureOutboxDomainRegistration';
import { createFeatureOutboxPayloadDecoder } from './featureOutboxPayloadDecoders';
import type { FeatureOutboxOperationPayloadMap } from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import {
  createNote,
  deleteNote,
  markNoteUsed,
  updateNote,
} from './notesStore';
import { notesQueryKeys } from './notesQuery';
import { profileQueryKeys } from './profileQuery';
import { usageQueryKeys } from './usageQuery';

const NOTE_UPDATE_FIELDS = [
  { key: 'title', type: 'string' as const, allowEmpty: true, optional: true },
  { key: 'content', type: 'string' as const, allowEmpty: true, optional: true },
  { key: 'locationText', type: 'string' as const, allowEmpty: true, optional: true },
  { key: 'rating', type: 'number' as const, optional: true },
  {
    key: 'newPhotos',
    type: 'array' as const,
    optional: true,
    items: {
      type: 'record' as const,
      rejectUnknownFields: true,
      fields: [
        { key: 'uri', type: 'string' as const },
        { key: 'name', type: 'string' as const },
        { key: 'mimeType', type: 'string' as const },
        { key: 'capturedAt', type: 'string' as const, optional: true },
      ],
    },
  },
  {
    key: 'deletePhotoIds',
    type: 'array' as const,
    optional: true,
    items: { type: 'string' as const },
  },
] as const;

export const NOTE_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: [
    'note.create',
    'note.update',
    'note.delete',
    'note.mark-used',
  ] as const,
  legacyPayloadPolicy: 'decode-as-current',
  payloadDecoders: {
    'note.create': createFeatureOutboxPayloadDecoder('note.create', [
      { key: 'content', type: 'string' },
      { key: 'title', type: 'string', allowEmpty: true, optional: true },
    ]),
    'note.update': createFeatureOutboxPayloadDecoder('note.update', [
      { key: 'noteId', type: 'string' },
      {
        key: 'updates',
        type: 'record',
        fields: NOTE_UPDATE_FIELDS,
        rejectUnknownFields: true,
      },
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
  replayIdentityResolvers: {
    'note.update': (payload) => pickFeatureOutboxReplayIdentity(payload, ['noteId']),
    'note.delete': (payload) => pickFeatureOutboxReplayIdentity(payload, ['noteId']),
    'note.mark-used': (payload) => pickFeatureOutboxReplayIdentity(payload, ['noteId']),
  },
  replayCacheHintResolvers: {
    'note.create': (payload) =>
      (payload.photos?.length ?? 0) > 0 ? ['note-photos', 'usage'] : [],
    'note.update': (payload) => {
      const hasNewPhotos = (payload.updates.newPhotos?.length ?? 0) > 0;
      const hasDeletedPhotos = (payload.updates.deletePhotoIds?.length ?? 0) > 0;
      return [
        ...(hasNewPhotos ? ['usage' as const] : []),
        ...(hasNewPhotos || hasDeletedPhotos ? ['note-photos' as const] : []),
      ];
    },
    'note.delete': () => ['note-photos'],
  },
  replayCacheEffects: {
    'note.create': reconcileNoteReplayCaches,
    'note.update': reconcileNoteReplayCaches,
    'note.delete': reconcileNoteReplayCaches,
    'note.mark-used': reconcileNoteReplayCaches,
  },
});

async function reconcileNoteReplayCaches(
  queryClient: QueryClient,
  outcome: FeatureOutboxSuccessfulReplayOutcome<
    'note.create' | 'note.update' | 'note.delete' | 'note.mark-used'
  >,
): Promise<void> {
  const noteId = getReplayIdentityString(outcome, 'noteId');
  if (outcome.operationName === 'note.delete' && noteId) {
    queryClient.removeQueries({ queryKey: notesQueryKeys.detail(noteId) });
  }

  const invalidations: Promise<unknown>[] = [
    queryClient.invalidateQueries({
      queryKey: notesQueryKeys.root,
      refetchType: outcome.operationName === 'note.create' ? 'all' : 'active',
    }),
    queryClient.invalidateQueries({ queryKey: profileQueryKeys.profile }),
    ...(noteId && outcome.operationName !== 'note.delete'
      ? [queryClient.invalidateQueries({ queryKey: notesQueryKeys.detail(noteId) })]
      : []),
  ];
  if (hasReplayCacheHint(outcome, 'note-photos')) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ['feature', 'notePhotos'] }),
    );
  }
  if (hasReplayCacheHint(outcome, 'usage')) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: usageQueryKeys.monthlyRoot }),
    );
  }
  await Promise.all(invalidations);
}

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
