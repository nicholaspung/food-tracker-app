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

const FOOD_PRODUCT_UPDATE_FIELDS = [
  { key: 'itemName', type: 'string' as const, optional: true },
  { key: 'locationText', type: 'string' as const, allowEmpty: true, optional: true },
  { key: 'rating', type: 'number' as const, optional: true },
  { key: 'itemCategory', type: 'string' as const, allowEmpty: true, optional: true },
  { key: 'notes', type: 'string' as const, allowEmpty: true, optional: true },
  {
    key: 'visibility',
    type: 'string' as const,
    allowedValues: ['friends', 'private'],
    optional: true,
  },
  { key: 'itemDate', type: 'string' as const, optional: true },
  {
    key: 'newPhoto',
    type: 'record' as const,
    optional: true,
    rejectUnknownFields: true,
    fields: [
      { key: 'uri', type: 'string' as const },
      { key: 'name', type: 'string' as const },
      { key: 'mimeType', type: 'string' as const },
    ],
  },
  {
    key: 'deletePhotoIds',
    type: 'array' as const,
    optional: true,
    items: { type: 'string' as const },
  },
] as const;

export const FOOD_PRODUCT_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: [
    'food-product.create',
    'food-product.update',
    'food-product.delete',
  ] as const,
  legacyPayloadPolicy: 'decode-as-current',
  payloadDecoders: {
    'food-product.create': createFeatureOutboxPayloadDecoder('food-product.create', [
      { key: 'itemName', type: 'string' },
      { key: 'rating', type: 'number' },
    ]),
    'food-product.update': createFeatureOutboxPayloadDecoder('food-product.update', [
      { key: 'foodProductId', type: 'string' },
      {
        key: 'updates',
        type: 'record',
        fields: FOOD_PRODUCT_UPDATE_FIELDS,
        rejectUnknownFields: true,
      },
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
