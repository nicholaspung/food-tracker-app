import { createFeatureOutboxDomainRegistration } from './featureOutboxDomainRegistration';
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
  replayAdapters: {
    'food-product.create': replayFoodProductCreate,
    'food-product.update': replayFoodProductUpdate,
    'food-product.delete': replayFoodProductDelete,
  },
});

async function replayFoodProductCreate(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createFoodProduct(payload as FeatureOutboxOperationPayloadMap['food-product.create'], requestOptions);
}

async function replayFoodProductUpdate(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const foodProductUpdatePayload = payload as FeatureOutboxOperationPayloadMap['food-product.update'];
  await updateFoodProduct(
    foodProductUpdatePayload.foodProductId,
    foodProductUpdatePayload.updates,
    requestOptions,
  );
}

async function replayFoodProductDelete(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const foodProductDeletePayload = payload as FeatureOutboxOperationPayloadMap['food-product.delete'];
  await deleteFoodProduct(foodProductDeletePayload.foodProductId, requestOptions);
}
