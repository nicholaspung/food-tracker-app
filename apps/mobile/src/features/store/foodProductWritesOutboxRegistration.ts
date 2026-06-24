import { createFeatureOutboxDomainRegistration } from './featureOutboxDomainRegistration';
import { createFeatureOutboxPayloadDecoder } from './featureOutboxPayloadDecoders';
import type { FeatureOutboxOperationPayloadMap } from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import {
  createFoodProduct,
  deleteFoodProduct,
  updateFoodProduct,
} from './featureStore';

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
});

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
