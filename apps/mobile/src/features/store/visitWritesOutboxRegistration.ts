import { createFeatureOutboxDomainRegistration } from './featureOutboxDomainRegistration';
import type { FeatureOutboxOperationPayloadMap } from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import {
  convertVisitItemToFoodProduct,
  createVisit,
  deleteVisit,
  updateVisit,
} from './featureStore';

export const VISIT_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: [
    'visit.create',
    'visit.update',
    'visit.delete',
    'visit.item.convert-to-food-product',
  ] as const,
  replayAdapters: {
    'visit.create': replayVisitCreate,
    'visit.update': replayVisitUpdate,
    'visit.delete': replayVisitDelete,
    'visit.item.convert-to-food-product': replayVisitItemConvertToFoodProduct,
  },
});

async function replayVisitCreate(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createVisit(payload as FeatureOutboxOperationPayloadMap['visit.create'], requestOptions);
}

async function replayVisitUpdate(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const visitUpdatePayload = payload as FeatureOutboxOperationPayloadMap['visit.update'];
  await updateVisit(visitUpdatePayload.visitId, visitUpdatePayload.updates, requestOptions);
}

async function replayVisitDelete(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  const visitDeletePayload = payload as FeatureOutboxOperationPayloadMap['visit.delete'];
  await deleteVisit(visitDeletePayload.visitId, requestOptions);
}

async function replayVisitItemConvertToFoodProduct(
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await convertVisitItemToFoodProduct(
    payload as FeatureOutboxOperationPayloadMap['visit.item.convert-to-food-product'],
    requestOptions,
  );
}
