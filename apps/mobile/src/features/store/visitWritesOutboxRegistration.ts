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
  convertVisitItemToFoodProduct,
  createVisit,
  deleteVisit,
  updateVisit,
} from './visitsStore';
import { syncFoodProductMutationCaches } from './foodProductsQuery';
import { homeFeedQueryKeys } from './homeFeedQuery';
import { profileQueryKeys } from './profileQuery';
import { syncVisitMutationCaches } from './visitsQuery';

export const VISIT_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: [
    'visit.create',
    'visit.update',
    'visit.delete',
    'visit.item.move',
    'visit.item.convert-to-food-product',
  ] as const,
  payloadDecoders: {
    'visit.create': createFeatureOutboxPayloadDecoder('visit.create', [
      { key: 'restaurantName', type: 'string' },
      { key: 'items', type: 'array' },
    ]),
    'visit.update': createFeatureOutboxPayloadDecoder('visit.update', [
      { key: 'visitId', type: 'string' },
      { key: 'updates', type: 'record' },
    ]),
    'visit.delete': createFeatureOutboxPayloadDecoder('visit.delete', [
      { key: 'visitId', type: 'string' },
    ]),
    'visit.item.move': createFeatureOutboxPayloadDecoder('visit.item.move', [
      { key: 'itemId', type: 'string' },
      { key: 'destinationVisitId', type: 'string' },
    ]),
    'visit.item.convert-to-food-product': createFeatureOutboxPayloadDecoder(
      'visit.item.convert-to-food-product',
      [{ key: 'itemId', type: 'string' }],
    ),
  },
  replayAdapters: {
    'visit.create': replayVisitCreate,
    'visit.update': replayVisitUpdate,
    'visit.delete': replayVisitDelete,
    'visit.item.convert-to-food-product': replayVisitItemConvertToFoodProduct,
  },
  replayIdentityResolvers: {
    'visit.update': (payload) => pickFeatureOutboxReplayIdentity(payload, ['visitId']),
    'visit.delete': (payload) => pickFeatureOutboxReplayIdentity(payload, ['visitId']),
    'visit.item.move': (payload) =>
      pickFeatureOutboxReplayIdentity(payload, ['itemId', 'destinationVisitId']),
  },
  replayCacheHintResolvers: {
    'visit.create': (payload) =>
      payload.items.some((item) => (item.photos?.length ?? 0) > 0)
        ? ['usage', 'visit-photos']
        : [],
    'visit.update': (payload) => {
      const items = payload.updates.items ?? [];
      const hasNewPhotos = items.some((item) => (item.newPhotos?.length ?? 0) > 0);
      const hasDeletedPhotos = items.some((item) => (item.deletePhotoIds?.length ?? 0) > 0);
      return [
        ...(hasNewPhotos ? ['usage' as const] : []),
        ...(hasNewPhotos || hasDeletedPhotos ? ['visit-photos' as const] : []),
      ];
    },
    'visit.delete': () => ['visit-photos'],
    'visit.item.move': () => ['visit-photos'],
    'visit.item.convert-to-food-product': () => [
      'food-product-photos',
      'visit-photos',
    ],
  },
  replayCacheEffects: {
    'visit.create': reconcileVisitReplayCaches,
    'visit.update': reconcileVisitReplayCaches,
    'visit.delete': reconcileVisitReplayCaches,
    'visit.item.move': reconcileVisitReplayCaches,
    'visit.item.convert-to-food-product': reconcileVisitReplayCaches,
  },
});

async function reconcileVisitReplayCaches(
  queryClient: QueryClient,
  outcome: FeatureOutboxSuccessfulReplayOutcome<
    | 'visit.create'
    | 'visit.update'
    | 'visit.delete'
    | 'visit.item.move'
    | 'visit.item.convert-to-food-product'
  >,
): Promise<void> {
  const invalidations: Promise<unknown>[] = [
    syncVisitMutationCaches(queryClient, {
      includeUsage: hasReplayCacheHint(outcome, 'usage'),
      includeVisitPhotos: hasReplayCacheHint(outcome, 'visit-photos'),
      visitId: getReplayIdentityString(outcome, 'visitId'),
    }),
    queryClient.invalidateQueries({ queryKey: profileQueryKeys.profile }),
  ];
  if (outcome.operationName === 'visit.create') {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: homeFeedQueryKeys.root,
        refetchType: 'all',
      }),
    );
  }
  if (outcome.operationName === 'visit.item.convert-to-food-product') {
    invalidations.push(
      syncFoodProductMutationCaches(queryClient, {
        includeFoodProductPhotos: hasReplayCacheHint(outcome, 'food-product-photos'),
      }),
    );
  }
  await Promise.all(invalidations);
}

async function replayVisitCreate(
  payload: FeatureOutboxOperationPayloadMap['visit.create'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createVisit(payload, requestOptions);
}

async function replayVisitUpdate(
  visitUpdatePayload: FeatureOutboxOperationPayloadMap['visit.update'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await updateVisit(visitUpdatePayload.visitId, visitUpdatePayload.updates, requestOptions);
}

async function replayVisitDelete(
  visitDeletePayload: FeatureOutboxOperationPayloadMap['visit.delete'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await deleteVisit(visitDeletePayload.visitId, requestOptions);
}

async function replayVisitItemConvertToFoodProduct(
  payload: FeatureOutboxOperationPayloadMap['visit.item.convert-to-food-product'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await convertVisitItemToFoodProduct(payload, requestOptions);
}
