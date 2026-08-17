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
  createFoodProduct,
  deleteFoodProduct,
  updateFoodProduct,
} from './foodProductsStore';
import { syncFoodProductMutationCaches } from './foodProductsQuery';
import { homeFeedQueryKeys } from './homeFeedQuery';
import { profileQueryKeys } from './profileQuery';

export const FOOD_PRODUCT_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: [
    'food-product.create',
    'food-product.update',
    'food-product.delete',
  ] as const,
  payloadDecoders: {
    'food-product.create': createFeatureOutboxPayloadDecoder('food-product.create', [
      { key: 'itemName', type: 'string' },
      { key: 'rating', type: 'number' },
    ]),
    'food-product.update': createFeatureOutboxPayloadDecoder('food-product.update', [
      { key: 'foodProductId', type: 'string' },
      { key: 'updates', type: 'record' },
    ]),
    'food-product.delete': createFeatureOutboxPayloadDecoder('food-product.delete', [
      { key: 'foodProductId', type: 'string' },
    ]),
  },
  replayAdapters: {
    'food-product.create': replayFoodProductCreate,
    'food-product.update': replayFoodProductUpdate,
    'food-product.delete': replayFoodProductDelete,
  },
  replayIdentityResolvers: {
    'food-product.update': (payload) =>
      pickFeatureOutboxReplayIdentity(payload, ['foodProductId']),
    'food-product.delete': (payload) =>
      pickFeatureOutboxReplayIdentity(payload, ['foodProductId']),
  },
  replayCacheHintResolvers: {
    'food-product.create': (payload) =>
      payload.photo ? ['food-product-photos', 'usage'] : [],
    'food-product.update': (payload) => [
      ...(payload.updates.newPhoto ? ['food-product-photos' as const, 'usage' as const] : []),
      ...((payload.updates.deletePhotoIds?.length ?? 0) > 0
        ? ['food-product-photos' as const]
        : []),
    ],
  },
  replayCacheEffects: {
    'food-product.create': reconcileFoodProductReplayCaches,
    'food-product.update': reconcileFoodProductReplayCaches,
    'food-product.delete': reconcileFoodProductReplayCaches,
  },
});

async function reconcileFoodProductReplayCaches(
  queryClient: QueryClient,
  outcome: FeatureOutboxSuccessfulReplayOutcome<
    'food-product.create' | 'food-product.update' | 'food-product.delete'
  >,
): Promise<void> {
  const foodProductId = getReplayIdentityString(outcome, 'foodProductId');
  const invalidations: Promise<unknown>[] = [
    syncFoodProductMutationCaches(queryClient, {
      foodProductId,
      includeFoodProductPhotos: hasReplayCacheHint(outcome, 'food-product-photos'),
      includeUsage: hasReplayCacheHint(outcome, 'usage'),
    }),
    queryClient.invalidateQueries({ queryKey: profileQueryKeys.profile }),
  ];
  if (outcome.operationName === 'food-product.create') {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: homeFeedQueryKeys.root,
        refetchType: 'all',
      }),
    );
  }
  await Promise.all(invalidations);
}

async function replayFoodProductCreate(
  payload: FeatureOutboxOperationPayloadMap['food-product.create'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createFoodProduct(payload, requestOptions);
}

async function replayFoodProductUpdate(
  foodProductUpdatePayload: FeatureOutboxOperationPayloadMap['food-product.update'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await updateFoodProduct(
    foodProductUpdatePayload.foodProductId,
    foodProductUpdatePayload.updates,
    requestOptions,
  );
}

async function replayFoodProductDelete(
  foodProductDeletePayload: FeatureOutboxOperationPayloadMap['food-product.delete'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await deleteFoodProduct(foodProductDeletePayload.foodProductId, requestOptions);
}
